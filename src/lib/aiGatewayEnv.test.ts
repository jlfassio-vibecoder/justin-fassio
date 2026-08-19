import { afterEach, describe, expect, it } from 'vitest';
import {
  aiGatewayUserErrorMessage,
  ensureAiGatewayApiKey,
  hasAiGatewayAuth,
  inspectDotenvKey,
  LOCAL_AI_GATEWAY_REJECTED_HELP,
  readAiGatewayApiKey,
} from '@/lib/aiGatewayEnv';

const ORIGINAL_KEY = process.env.AI_GATEWAY_API_KEY;
const ORIGINAL_VERCEL = process.env.VERCEL;
const ORIGINAL_OIDC = process.env.VERCEL_OIDC_TOKEN;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.AI_GATEWAY_API_KEY;
  else process.env.AI_GATEWAY_API_KEY = ORIGINAL_KEY;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = ORIGINAL_VERCEL;
  if (ORIGINAL_OIDC === undefined) delete process.env.VERCEL_OIDC_TOKEN;
  else process.env.VERCEL_OIDC_TOKEN = ORIGINAL_OIDC;
});

describe('aiGatewayEnv', () => {
  it('treats a process env key as authenticated', () => {
    process.env.AI_GATEWAY_API_KEY = ' test-gateway-key ';
    expect(ensureAiGatewayApiKey()).toBe('test-gateway-key');
    expect(hasAiGatewayAuth()).toBe(true);
  });

  it('strips wrapping quotes from the key', () => {
    process.env.AI_GATEWAY_API_KEY = "'vck_test_quoted_key'";
    expect(ensureAiGatewayApiKey()).toBe('vck_test_quoted_key');
  });

  it('treats Vercel OIDC as authenticated without a local key', () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL = '1';
    expect(hasAiGatewayAuth()).toBe(true);
  });

  it('does not read dotenv files when Vercel OIDC is present', () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL = '1';
    expect(readAiGatewayApiKey()).toBeNull();
  });

  it('rewrites GatewayAuthenticationError copy for the UI', () => {
    expect(
      aiGatewayUserErrorMessage(
        new Error('Unauthenticated request to AI Gateway. Set the AI_GATEWAY_API_KEY'),
      ),
    ).toBe(LOCAL_AI_GATEWAY_REJECTED_HELP);
  });

  it('prefers an uncommented dotenv assignment over a commented example', () => {
    expect(
      inspectDotenvKey(
        [
          '# AI_GATEWAY_API_KEY=',
          'FEATURE_MULTI_LINE_AI=true',
          'AI_GATEWAY_API_KEY=vck_from_file',
        ].join('\n'),
        'AI_GATEWAY_API_KEY',
      ),
    ).toEqual({ value: 'vck_from_file', commentedOnly: false });
  });

  it('reports a commented-only dotenv key', () => {
    expect(inspectDotenvKey('# AI_GATEWAY_API_KEY=\n', 'AI_GATEWAY_API_KEY')).toEqual({
      value: null,
      commentedOnly: true,
    });
  });
});
