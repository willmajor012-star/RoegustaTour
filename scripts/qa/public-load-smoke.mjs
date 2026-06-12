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

const baseUrl = String(args.get('base-url') || process.env.BASE_URL || 'http://localhost:8888').replace(/\/$/, '');
const concurrency = Math.max(1, Number(args.get('concurrency') || process.env.CONCURRENCY || 5));
const requests = Math.max(1, Number(args.get('requests') || process.env.REQUESTS || 30));
const timeoutMs = Math.max(500, Number(args.get('timeout-ms') || process.env.TIMEOUT_MS || 10000));
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
