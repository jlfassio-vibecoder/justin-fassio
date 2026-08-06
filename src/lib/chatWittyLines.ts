/** Rotating Old Guys Rule–adjacent holding lines when Justin is silent. */

export const CHAT_WITTY_LINES = [
  'He must have just stepped away to climb a rock. Hang tight — Justin will jump back in.',
  'Probably out chasing daylight. Leave a note; he’ll circle back before the sun does.',
  'Odds are he’s mid coffee-and-catalog. I’m holding the fort until he shows.',
  'Might be measuring a tee for the tenth time. Classic. I’ll keep you company.',
  'He’s either on a call or arguing with a zipper. Either way, I’m here.',
  'Stepped out to touch grass — literally. I’m here until he wanders back in.',
  'He might be out on the water for real. Leave your question — he’ll come back with an answer, not a fish story.',
  'Likely stuck choosing between navy and… other navy. Back shortly.',
] as const;

export const CHAT_SILENCE_MS = 45_000;

export function pickWittyLine(seed?: string | number): string {
  const lines: readonly string[] = CHAT_WITTY_LINES;
  if (lines.length === 0) return 'Justin will be right with you.';
  let index: number;
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    index = Math.abs(Math.trunc(seed)) % lines.length;
  } else if (typeof seed === 'string' && seed.length > 0) {
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    }
    index = hash % lines.length;
  } else {
    index = Math.floor(Math.random() * lines.length);
  }
  return lines[index] ?? lines[0]!;
}
