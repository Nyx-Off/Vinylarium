/**
 * Discogs stores the pressing country as a free-text string ("US", "UK",
 * "France", "Europe"…). We map the common ones to an ISO code + an approximate
 * centroid so they can be plotted on the globe. Non-geographic values like
 * "Europe" or "Worldwide" resolve to null and are simply not plotted.
 */
export interface CountryGeo {
  code: string;
  lat: number;
  lng: number;
}

// Aliases → canonical key used in the table below.
const ALIASES: Record<string, string> = {
  us: 'united states',
  usa: 'united states',
  'u.s.a.': 'united states',
  uk: 'united kingdom',
  'u.k.': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  'south korea': 'korea, south',
  korea: 'korea, south',
  russia: 'russian federation',
  'ussr': 'russian federation',
  czech: 'czech republic',
  czechia: 'czech republic',
};

const TABLE: Record<string, CountryGeo> = {
  'united states': { code: 'US', lat: 39.8, lng: -98.6 },
  'united kingdom': { code: 'GB', lat: 54.0, lng: -2.0 },
  france: { code: 'FR', lat: 46.6, lng: 2.4 },
  germany: { code: 'DE', lat: 51.2, lng: 10.4 },
  italy: { code: 'IT', lat: 41.9, lng: 12.6 },
  spain: { code: 'ES', lat: 40.0, lng: -3.7 },
  netherlands: { code: 'NL', lat: 52.1, lng: 5.3 },
  belgium: { code: 'BE', lat: 50.5, lng: 4.5 },
  switzerland: { code: 'CH', lat: 46.8, lng: 8.2 },
  austria: { code: 'AT', lat: 47.5, lng: 14.6 },
  portugal: { code: 'PT', lat: 39.5, lng: -8.0 },
  ireland: { code: 'IE', lat: 53.4, lng: -8.0 },
  sweden: { code: 'SE', lat: 60.1, lng: 18.6 },
  norway: { code: 'NO', lat: 60.5, lng: 8.5 },
  denmark: { code: 'DK', lat: 56.0, lng: 9.5 },
  finland: { code: 'FI', lat: 64.0, lng: 26.0 },
  iceland: { code: 'IS', lat: 64.9, lng: -19.0 },
  poland: { code: 'PL', lat: 52.0, lng: 19.1 },
  'czech republic': { code: 'CZ', lat: 49.8, lng: 15.5 },
  hungary: { code: 'HU', lat: 47.2, lng: 19.5 },
  greece: { code: 'GR', lat: 39.1, lng: 21.8 },
  'russian federation': { code: 'RU', lat: 61.5, lng: 105.3 },
  ukraine: { code: 'UA', lat: 48.4, lng: 31.2 },
  romania: { code: 'RO', lat: 45.9, lng: 24.9 },
  'canada': { code: 'CA', lat: 56.1, lng: -106.3 },
  mexico: { code: 'MX', lat: 23.6, lng: -102.5 },
  brazil: { code: 'BR', lat: -14.2, lng: -51.9 },
  argentina: { code: 'AR', lat: -38.4, lng: -63.6 },
  chile: { code: 'CL', lat: -35.7, lng: -71.5 },
  colombia: { code: 'CO', lat: 4.6, lng: -74.3 },
  japan: { code: 'JP', lat: 36.2, lng: 138.3 },
  'korea, south': { code: 'KR', lat: 36.5, lng: 127.9 },
  china: { code: 'CN', lat: 35.9, lng: 104.2 },
  'hong kong': { code: 'HK', lat: 22.3, lng: 114.2 },
  taiwan: { code: 'TW', lat: 23.7, lng: 121.0 },
  india: { code: 'IN', lat: 20.6, lng: 79.0 },
  indonesia: { code: 'ID', lat: -0.8, lng: 113.9 },
  thailand: { code: 'TH', lat: 15.9, lng: 101.0 },
  philippines: { code: 'PH', lat: 12.9, lng: 121.8 },
  australia: { code: 'AU', lat: -25.3, lng: 133.8 },
  'new zealand': { code: 'NZ', lat: -40.9, lng: 174.9 },
  'south africa': { code: 'ZA', lat: -30.6, lng: 22.9 },
  nigeria: { code: 'NG', lat: 9.1, lng: 8.7 },
  jamaica: { code: 'JM', lat: 18.1, lng: -77.3 },
  turkey: { code: 'TR', lat: 39.0, lng: 35.2 },
  israel: { code: 'IL', lat: 31.0, lng: 34.9 },
  egypt: { code: 'EG', lat: 26.8, lng: 30.8 },
  yugoslavia: { code: 'RS', lat: 44.0, lng: 21.0 },
};

export function geoForCountry(name: string): CountryGeo | null {
  const key = name.trim().toLowerCase();
  const canonical = ALIASES[key] ?? key;
  return TABLE[canonical] ?? null;
}
