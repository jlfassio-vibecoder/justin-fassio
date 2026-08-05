export type MessageIdentityParts = {
  email: string;
  businessName: string;
  buyerName: string;
};

export function normalizeIdentityPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Stable identity key: normalized `email|business_name|buyer_name`.
 * (Deterministic string key — unique index enforces one thread per identity.)
 */
export function identityFingerprint(parts: MessageIdentityParts): string {
  return [
    normalizeIdentityPart(parts.email),
    normalizeIdentityPart(parts.businessName),
    normalizeIdentityPart(parts.buyerName),
  ].join('|');
}

export type MappingStatus = 'unmapped' | 'suggested' | 'confirmed';

/**
 * When an inbound identity fingerprint differs from the fingerprint stored at
 * confirmation time, staff must re-confirm the account map.
 */
export function mappingStatusAfterInbound(args: {
  mappingStatus: MappingStatus;
  confirmedFingerprint: string | null;
  inboundFingerprint: string;
}): { mappingStatus: MappingStatus; needsReconfirm: boolean } {
  if (
    args.mappingStatus === 'confirmed' &&
    args.confirmedFingerprint &&
    args.confirmedFingerprint !== args.inboundFingerprint
  ) {
    return { mappingStatus: 'suggested', needsReconfirm: true };
  }
  return { mappingStatus: args.mappingStatus, needsReconfirm: false };
}
