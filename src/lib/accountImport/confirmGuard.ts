export function shouldAcceptImportCommit(input: { inFlight: boolean; step: string }): boolean {
  if (input.inFlight) return false;
  return input.step === 'confirm';
}
