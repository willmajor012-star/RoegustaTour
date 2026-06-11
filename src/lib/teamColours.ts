const TEAM_COLOUR_FALLBACKS = ['#0F2F24', '#6E2635'];
const CSS_COLOUR_PATTERN = /^(#[0-9a-f]{3,8}|rgb\(|hsl\(|var\()/i;

export function normalizeTeamColour(colour: string | undefined, index = 0) {
  const trimmed = colour?.trim();
  if (trimmed && CSS_COLOUR_PATTERN.test(trimmed)) return trimmed;
  return TEAM_COLOUR_FALLBACKS[index % TEAM_COLOUR_FALLBACKS.length];
}

export function normalizeTeamColourPair(leftColour?: string, rightColour?: string) {
  const left = normalizeTeamColour(leftColour, 0);
  const right = normalizeTeamColour(rightColour, 1);
  return left.toLowerCase() === right.toLowerCase() ? [left, TEAM_COLOUR_FALLBACKS[1]] as const : [left, right] as const;
}
