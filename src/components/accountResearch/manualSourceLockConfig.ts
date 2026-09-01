const MANUAL_LOCK_CONFIG: Record<string, { hint: string; placeholder: string; ariaLabel: string }> =
  {
    website: {
      hint: 'No website? Paste their Facebook or Instagram page URL.',
      placeholder: 'https://example.com or https://facebook.com/...',
      ariaLabel: 'Official website URL',
    },
    facebook: {
      hint: 'Enter the official Facebook page URL.',
      placeholder: 'https://facebook.com/...',
      ariaLabel: 'Official Facebook page URL',
    },
    instagram: {
      hint: 'Enter the official Instagram profile URL.',
      placeholder: 'https://instagram.com/...',
      ariaLabel: 'Official Instagram profile URL',
    },
  };

export function supportsManualSourceLock(sourceType: string): boolean {
  return sourceType in MANUAL_LOCK_CONFIG;
}

export function manualSourceLockConfig(sourceType: string) {
  return MANUAL_LOCK_CONFIG[sourceType] ?? null;
}
