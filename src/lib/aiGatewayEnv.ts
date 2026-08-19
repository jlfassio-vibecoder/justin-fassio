/**
 * AI SDK Gateway authenticates with apiKey or Vercel OIDC.
 * Local `astro dev` does not reliably copy .env into process.env for SSR API
 * routes, and Vite snapshots import.meta.env on first compile. Read the key
 * from .env / .env.local on each request and pass it to createGateway.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGateway, gateway } from 'ai';

export const LOCAL_AI_GATEWAY_AUTH_HELP =
  'AI_GATEWAY_API_KEY is not in the saved .env on disk. If the vck_ key is only in the open editor tab, save the file (Cmd+S; a white dot on the tab means unsaved). The line must be uncommented: AI_GATEWAY_API_KEY=vck_… with no # at the start.';

export const LOCAL_AI_GATEWAY_REJECTED_HELP =
  'AI Gateway rejected the API key (unauthenticated). Use a current vck_ key from Vercel → AI Gateway → API Keys.';

const GATEWAY_KEY = 'AI_GATEWAY_API_KEY';

function trimEnv(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let trimmed = value.trim();
  if (!trimmed.startsWith('"') && !trimmed.startsWith("'")) {
    const hash = trimmed.indexOf(' #');
    if (hash >= 0) trimmed = trimmed.slice(0, hash).trim();
  }
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed ? trimmed : null;
}

/** Parse one KEY from dotenv text. Uncommented assignments win over `# KEY=`. */
export function inspectDotenvKey(
  contents: string,
  key: string,
): { value: string | null; commentedOnly: boolean } {
  let value: string | null = null;
  let commentedOnly = false;
  for (const raw of contents.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('#')) {
      const rest = trimmed
        .slice(1)
        .trim()
        .replace(/^export\s+/, '');
      if (rest === key || rest.startsWith(`${key}=`)) commentedOnly = true;
      continue;
    }
    const line = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    if (line.slice(0, eq).trim() !== key) continue;
    value = trimEnv(line.slice(eq + 1));
  }
  return { value, commentedOnly: value ? false : commentedOnly };
}

function dotenvSearchRoots(): string[] {
  const roots: string[] = [];
  const add = (dir: string | undefined) => {
    if (!dir || roots.includes(dir)) return;
    roots.push(dir);
  };
  if (typeof process !== 'undefined') {
    add(process.cwd());
    add(process.env.INIT_CWD);
  }
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      add(dir);
      const parent = resolve(dir, '..');
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // import.meta.url is unavailable in some test runtimes
  }
  return roots;
}

function readKeyFromDotenvFiles(): string | null {
  for (const root of dotenvSearchRoots()) {
    for (const name of ['.env.local', '.env']) {
      const file = resolve(root, name);
      if (!existsSync(file)) continue;
      let contents: string;
      try {
        contents = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const inspected = inspectDotenvKey(contents, GATEWAY_KEY);
      if (inspected.value) return inspected.value;
    }
  }
  return null;
}

export function readAiGatewayApiKey(): string | null {
  const fromMeta = trimEnv(
    typeof import.meta !== 'undefined'
      ? (import.meta.env as unknown as { AI_GATEWAY_API_KEY?: string }).AI_GATEWAY_API_KEY
      : undefined,
  );
  if (fromMeta) return fromMeta;
  const fromProcess = trimEnv(
    typeof process !== 'undefined' ? process.env[GATEWAY_KEY] : undefined,
  );
  if (fromProcess) return fromProcess;
  return readKeyFromDotenvFiles();
}

/** Copy the resolved key onto process.env so default gateway() / tools can authenticate. */
export function ensureAiGatewayApiKey(): string | null {
  const key = readAiGatewayApiKey();
  if (key && typeof process !== 'undefined') {
    process.env[GATEWAY_KEY] = key;
  }
  return key;
}

export function hasAiGatewayAuth(): boolean {
  if (ensureAiGatewayApiKey()) return true;
  if (typeof process === 'undefined') return false;
  return Boolean(trimEnv(process.env.VERCEL_OIDC_TOKEN) || trimEnv(process.env.VERCEL));
}

export function staffAiGateway() {
  const apiKey = ensureAiGatewayApiKey();
  if (apiKey) return createGateway({ apiKey });
  return gateway;
}

export function staffGatewayModel(modelId = 'openai/gpt-4o') {
  return staffAiGateway()(modelId);
}

export function aiGatewayUserErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (/unauthenticated|AI_GATEWAY_API_KEY/i.test(message)) {
    return LOCAL_AI_GATEWAY_REJECTED_HELP;
  }
  const trimmed = message.trim();
  return trimmed || 'An error occurred.';
}
