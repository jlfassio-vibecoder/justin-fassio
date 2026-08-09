/** Shared validation bounds for staff OGR product email (client + API). */
export const OGR_PRODUCT_EMAIL_MAX_TO = 200;
export const OGR_PRODUCT_EMAIL_MAX_RECIPIENT_NAME = 120;
export const OGR_PRODUCT_EMAIL_MAX_SUBJECT = 200;
export const OGR_PRODUCT_EMAIL_MAX_PROSE = 2000;

/** Basic recipient shape: local@domain, no whitespace/control chars (header-injection guard). */
const OGR_PRODUCT_EMAIL_RECIPIENT_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

function hasControlOrWhitespace(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return true;
  }
  return false;
}

export function isValidOgrProductEmailRecipient(value: string): boolean {
  if (!value || value.length > OGR_PRODUCT_EMAIL_MAX_TO) return false;
  if (hasControlOrWhitespace(value)) return false;
  return OGR_PRODUCT_EMAIL_RECIPIENT_RE.test(value);
}
