export function lookalikeSeedNote(jobId: string): string {
  return [
    `Sourced: AI lookalike from historical OGR seeds in job ${jobId}.`,
    'Inference: never ordered. Do not assume purchase history, current buyer, phone, or website.',
  ].join(' ');
}

export function lookalikeSourceNote(jobId: string): string {
  return `Lookalike discovery job ${jobId}.`;
}
