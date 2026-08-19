/** Client-safe fetch for staff AI JSON error bodies (`{ error: string }`). */

export async function staffAiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await globalThis.fetch(input, init);
  if (res.ok) return res;
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) return res;
  let data: unknown;
  try {
    data = await res.clone().json();
  } catch {
    return res;
  }
  const error =
    data && typeof data === 'object' && 'error' in data ? (data as { error: unknown }).error : null;
  if (typeof error === 'string' && error.trim()) {
    throw new Error(error.trim());
  }
  return res;
}
