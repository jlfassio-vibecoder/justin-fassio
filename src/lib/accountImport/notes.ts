export function historicalImportSeedNote(input: {
  filename: string;
  formerRepCode: string | null;
}): string {
  const code = input.formerRepCode?.trim() || 'not provided';
  return [
    `Sourced: Listed as a verified past OGR customer in ${input.filename}. Former rep code: ${code}. Shipping address from file. No purchase date or order value was supplied.`,
    'Inference: Treat as dormant reactivation candidate until a qualifying order is logged. Do not assume current buyer, phone, or website.',
  ].join(' ');
}

export function zoominfoImportSeedNote(input: { filename: string }): string {
  return [
    `Sourced: Listed as a ZoomInfo lead in ${input.filename}. Shipping address from file when present.`,
    'Inference: Treat as an Eagle Peak prospect that has never ordered. Do not assume historical purchase, current buyer, phone, or website.',
  ].join(' ');
}

export function importSourceNote(input: {
  sourceType: string;
  batchId: string;
  filename: string;
  formerRepCode: string | null;
}): string {
  const former = input.formerRepCode?.trim() ? ` Former rep: ${input.formerRepCode.trim()}.` : '';
  return `Import ${input.sourceType} batch ${input.batchId} from ${input.filename}.${former}`;
}
