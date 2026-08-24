import type { AccountResearchContext } from '@/lib/accountResearch/context';

/** Spallumcheen Golf & Country Club — audited false-positive Instagram reels (run ead7db1c). */
export const SPALLUMCHEEN_CONTEXT: AccountResearchContext = {
  businessName: 'Spallumcheen Golf & Country Club',
  address: '9401 Highway 97',
  city: 'Vernon',
  region: 'Okanagan',
  phone: '250-545-5824',
  website: 'https://spallumcheengolf.com/',
  territoryCode: 'bc',
  territoryName: 'British Columbia',
  operationalTerritoryCode: 'bc',
  operationalTerritoryName: 'British Columbia',
  officialHostname: 'spallumcheengolf.com',
  provinceName: 'British Columbia',
  countryName: 'Canada',
};

export const SPALLUMCHEEN_INSTAGRAM_NOISE = [
  {
    url: 'https://instagram.com/reel/DaOqjqEpIR9',
    excerpt: 'North Palm Beach Country Club from the beautifully maintained course 561-365-4692',
  },
  {
    url: 'https://instagram.com/reel/Dai-u3Sj1kP',
    excerpt: 'Golf Classic September 16 at Great Gorge Golf Club in Vernon, NJ',
  },
  {
    url: 'https://instagram.com/p/DX9_AmtCTrE',
    excerpt: 'Indian Hills Golf Course - Mt Vernon, IL',
  },
  {
    url: 'https://instagram.com/p/DT8_bgHDm_K',
    excerpt: 'Founder deposit $115,000 Founding Member',
  },
  {
    url: 'https://instagram.com/reel/DYATqZeko5b',
    excerpt: 'capilanogolf Where timeless golf natural beauty',
  },
] as const;

export const SPALLUMCHEEN_CONFIRMED_HANDLE = 'spallumcheengolf';
