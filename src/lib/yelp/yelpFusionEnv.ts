import { ensureServerEnvKey, readServerEnvKey } from '@/lib/aiGatewayEnv';

const YELP_FUSION_KEY = 'YELP_FUSION_API_KEY';

export const LOCAL_YELP_FUSION_KEY_HELP =
  'YELP_FUSION_API_KEY is not loaded. Save .env with an uncommented YELP_FUSION_API_KEY=… line (no # at the start) and restart the dev server.';

export function readYelpFusionApiKey(): string | null {
  return readServerEnvKey(YELP_FUSION_KEY);
}

export function ensureYelpFusionApiKey(): string | null {
  return ensureServerEnvKey(YELP_FUSION_KEY);
}

export function hasYelpFusionApiKey(): boolean {
  return Boolean(ensureYelpFusionApiKey());
}
