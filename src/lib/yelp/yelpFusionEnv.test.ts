import { afterEach, describe, expect, it } from 'vitest';
import { readServerEnvKey } from '@/lib/aiGatewayEnv';
import {
  ensureYelpFusionApiKey,
  hasYelpFusionApiKey,
  readYelpFusionApiKey,
} from '@/lib/yelp/yelpFusionEnv';

const ORIGINAL_KEY = process.env.YELP_FUSION_API_KEY;

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.YELP_FUSION_API_KEY;
  else process.env.YELP_FUSION_API_KEY = ORIGINAL_KEY;
});

describe('yelpFusionEnv', () => {
  it('reads YELP_FUSION_API_KEY from process.env', () => {
    process.env.YELP_FUSION_API_KEY = ' test-yelp-key ';
    expect(readYelpFusionApiKey()).toBe('test-yelp-key');
    expect(hasYelpFusionApiKey()).toBe(true);
    expect(ensureYelpFusionApiKey()).toBe('test-yelp-key');
  });

  it('uses readServerEnvKey for the fusion key name', () => {
    process.env.YELP_FUSION_API_KEY = 'from-process';
    expect(readServerEnvKey('YELP_FUSION_API_KEY')).toBe('from-process');
  });
});
