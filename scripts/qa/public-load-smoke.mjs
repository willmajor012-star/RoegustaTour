#!/usr/bin/env node

/**
 * Lightweight read-only Roegusta Tour public endpoint load smoke script.
 *
 * Defaults are intentionally modest. Run against local Netlify dev by default:
 *   node scripts/qa/public-load-smoke.mjs --base-url http://localhost:8888 --concurrency 5 --requests 30
 *
 * Use --dry-run to print the plan without making requests.
 */
const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg.startsWith('--')) {
    const key = arg.slice(2);
    const next = process.argv[i + 1];
    if (!next || next.startsWith('--')) args.set(key, true);
    else {
      args.set(key, next);
      i += 1;
    }
  }
}

function usage() {
  console.log(`Usage: node scripts/qa/public-load-smoke.mjs [options]

Options:
  --base-url <url>       Target app origin (default: BASE_URL or http://localhost:8888)
  --concurrency <count>  Concurrent workers, positive integer (default: CONCURRENCY or 5)
  --requests <count>     Total requests, positive integer (default: REQUESTS or 30)
  --timeout-ms <ms>      Per-request timeout, integer >= 500 (default: TIMEOUT_MS or 10000)
  --dry-run              Print the planned endpoint load profile without requests
  --help                 Show this help text`);
}

function failConfig(message) {
  console.error(`Configuration error: ${message}`);
  console.error('Run with --help for usage.');
  process.exit(2);
}

function readOption(name, envName, fallback) {
  return args.has(name) ? args.get(name) : process.env[envName] || fallback;
}

function parsePositiveInteger(name, envName, fallback, minimum = 1) {
  const raw = readOption(name, envName, fallback);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum) {
    failConfig(`--${name} must be an integer greater than or equal to ${minimum}; received ${JSON.stringify(raw)}.`);
  }
  return value;
}

if (args.has('help')) {
  usage();
  process.exit(0);
}

const rawBaseUrl = String(readOption('base-url', 'BASE_URL', 'http://localhost:8888')).replace(/\/+$/, '');
let baseUrl;
try {
  baseUrl = new URL(rawBaseUrl).origin;
} catch {
  failConfig(`--base-url must be a valid URL origin; received ${JSON.stringify(rawBaseUrl)}.`);
}
const concurrency = parsePositiveInteger('concurrency', 'CONCURRENCY', 5);
const requests = parsePositiveInteger('requests', 'REQUESTS', 30);
const timeoutMs = parsePositiveInteger('timeout-ms', 'TIMEOUT_MS', 10000, 500);
const dryRun = args.has('dry-run');

const endpoints = [
  '/.netlify/functions/public-summary',
  '/.netlify/functions/public-score',
  '/.netlify/functions/public-matches',
  '/.netlify/functions/public-bet-markets',
  '/.netlify/functions/public-advanced-stats',
  '/.netlify/functions/public-tour-info',
];

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function hit(endpoint, index) {
  const controller = new AbortController();
  const started = performance.now();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, { signal: controller.signal, headers: { 'x-qa-load-smoke': 'true' } });
    const text = await response.text();
    return { endpoint, index, ok: response.ok, status: response.status, ms: performance.now() - started, bytes: Buffer.byteLength(text) };
  } catch (error) {
    return { endpoint, index, ok: false, status: 0, ms: performance.now() - started, bytes: 0, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  console.log(JSON.stringify({ baseUrl, concurrency, requests, timeoutMs, endpoints, dryRun }, null, 2));
  if (dryRun) return;

  const queue = Array.from({ length: requests }, (_, index) => ({ endpoint: endpoints[index % endpoints.length], index }));
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, requests) }, async () => {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) return;
      results.push(await hit(job.endpoint, job.index));
    }
  });
  await Promise.all(workers);

  const failures = results.filter((result) => !result.ok);
  const latencies = results.map((result) => result.ms);
  const bytes = results.reduce((total, result) => total + result.bytes, 0);
  const byEndpoint = Object.fromEntries(endpoints.map((endpoint) => {
    const rows = results.filter((result) => result.endpoint === endpoint);
    return [endpoint, {
      requests: rows.length,
      failures: rows.filter((result) => !result.ok).length,
      p50Ms: Math.round(percentile(rows.map((result) => result.ms), 50)),
      p95Ms: Math.round(percentile(rows.map((result) => result.ms), 95)),
      maxBytes: Math.max(0, ...rows.map((result) => result.bytes)),
      statuses: rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {}),
    }];
  }));

  console.log(JSON.stringify({
    totalRequests: results.length,
    failures: failures.length,
    p50Ms: Math.round(percentile(latencies, 50)),
    p95Ms: Math.round(percentile(latencies, 95)),
    maxMs: Math.round(Math.max(0, ...latencies)),
    totalBytes: bytes,
    byEndpoint,
    sampleFailures: failures.slice(0, 5),
  }, null, 2));

  if (failures.length > 0) process.exitCode = 1;
}

await main();
