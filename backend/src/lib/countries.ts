/**
 * Country geo lookup used by the globe.
 *
 * Two entry points:
 *  - `geoForCountry(name)` — Discogs pressing strings and MusicBrainz area
 *    names ("US", "UK", "France", "United States"…) → ISO code + centroid.
 *    Non-geographic values like "Europe" or "Worldwide" resolve to null.
 *  - `geoForISO(code)` — ISO 3166-1 alpha-2 codes (what the MusicBrainz
 *    artist `country` field returns) → same geo entry.
 */
export interface CountryGeo {
  code: string;
  name: string; // canonical English display name
  lat: number;
  lng: number;
}

// Aliases → canonical key used in the table below. Covers Discogs shorthand,
// historical pressing countries and MusicBrainz naming variants.
const ALIASES: Record<string, string> = {
  us: 'united states',
  usa: 'united states',
  'u.s.a.': 'united states',
  'united states of america': 'united states',
  uk: 'united kingdom',
  'u.k.': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  'northern ireland': 'united kingdom',
  'great britain': 'united kingdom',
  'south korea': 'korea, south',
  'republic of korea': 'korea, south',
  korea: 'korea, south',
  'north korea': 'korea, north',
  russia: 'russian federation',
  ussr: 'russian federation',
  'soviet union': 'russian federation',
  czech: 'czech republic',
  czechia: 'czech republic',
  czechoslovakia: 'czech republic',
  'west germany': 'germany',
  'east germany': 'germany',
  'germany, west': 'germany',
  'germany, east': 'germany',
  holland: 'netherlands',
  'the netherlands': 'netherlands',
  türkiye: 'turkey',
  turkiye: 'turkey',
  'viet nam': 'vietnam',
  burma: 'myanmar',
  'ivory coast': "côte d'ivoire",
  "cote d'ivoire": "côte d'ivoire",
  'democratic republic of the congo': 'congo, dr',
  'congo, democratic republic of the': 'congo, dr',
  'congo-kinshasa': 'congo, dr',
  zaire: 'congo, dr',
  'republic of the congo': 'congo',
  'congo-brazzaville': 'congo',
  'cape verde': 'cabo verde',
  serbia: 'yugoslavia',
  'serbia and montenegro': 'yugoslavia',
  persia: 'iran',
  'macedonia': 'north macedonia',
  'bosnia & herzegovina': 'bosnia and herzegovina',
  'trinidad & tobago': 'trinidad and tobago',
  'uae': 'united arab emirates',
};

const TABLE: Record<string, CountryGeo> = {
  // ── Americas ──────────────────────────────────────────────────────────
  'united states': { code: 'US', name: 'United States', lat: 39.8, lng: -98.6 },
  canada: { code: 'CA', name: 'Canada', lat: 56.1, lng: -106.3 },
  mexico: { code: 'MX', name: 'Mexico', lat: 23.6, lng: -102.5 },
  guatemala: { code: 'GT', name: 'Guatemala', lat: 15.8, lng: -90.2 },
  'el salvador': { code: 'SV', name: 'El Salvador', lat: 13.8, lng: -88.9 },
  honduras: { code: 'HN', name: 'Honduras', lat: 15.2, lng: -86.2 },
  nicaragua: { code: 'NI', name: 'Nicaragua', lat: 12.9, lng: -85.2 },
  'costa rica': { code: 'CR', name: 'Costa Rica', lat: 9.7, lng: -83.8 },
  panama: { code: 'PA', name: 'Panama', lat: 8.5, lng: -80.8 },
  cuba: { code: 'CU', name: 'Cuba', lat: 21.5, lng: -77.8 },
  jamaica: { code: 'JM', name: 'Jamaica', lat: 18.1, lng: -77.3 },
  haiti: { code: 'HT', name: 'Haiti', lat: 19.0, lng: -72.3 },
  'dominican republic': { code: 'DO', name: 'Dominican Republic', lat: 18.7, lng: -70.2 },
  'puerto rico': { code: 'PR', name: 'Puerto Rico', lat: 18.2, lng: -66.4 },
  'trinidad and tobago': { code: 'TT', name: 'Trinidad and Tobago', lat: 10.7, lng: -61.2 },
  barbados: { code: 'BB', name: 'Barbados', lat: 13.2, lng: -59.5 },
  bahamas: { code: 'BS', name: 'Bahamas', lat: 25.0, lng: -77.4 },
  colombia: { code: 'CO', name: 'Colombia', lat: 4.6, lng: -74.3 },
  venezuela: { code: 'VE', name: 'Venezuela', lat: 6.4, lng: -66.6 },
  ecuador: { code: 'EC', name: 'Ecuador', lat: -1.8, lng: -78.2 },
  peru: { code: 'PE', name: 'Peru', lat: -9.2, lng: -75.0 },
  brazil: { code: 'BR', name: 'Brazil', lat: -14.2, lng: -51.9 },
  bolivia: { code: 'BO', name: 'Bolivia', lat: -16.3, lng: -63.6 },
  paraguay: { code: 'PY', name: 'Paraguay', lat: -23.4, lng: -58.4 },
  uruguay: { code: 'UY', name: 'Uruguay', lat: -32.5, lng: -55.8 },
  argentina: { code: 'AR', name: 'Argentina', lat: -38.4, lng: -63.6 },
  chile: { code: 'CL', name: 'Chile', lat: -35.7, lng: -71.5 },
  guyana: { code: 'GY', name: 'Guyana', lat: 4.9, lng: -58.9 },
  suriname: { code: 'SR', name: 'Suriname', lat: 3.9, lng: -56.0 },

  // ── Europe ────────────────────────────────────────────────────────────
  'united kingdom': { code: 'GB', name: 'United Kingdom', lat: 54.0, lng: -2.0 },
  ireland: { code: 'IE', name: 'Ireland', lat: 53.4, lng: -8.0 },
  france: { code: 'FR', name: 'France', lat: 46.6, lng: 2.4 },
  germany: { code: 'DE', name: 'Germany', lat: 51.2, lng: 10.4 },
  italy: { code: 'IT', name: 'Italy', lat: 41.9, lng: 12.6 },
  spain: { code: 'ES', name: 'Spain', lat: 40.0, lng: -3.7 },
  portugal: { code: 'PT', name: 'Portugal', lat: 39.5, lng: -8.0 },
  netherlands: { code: 'NL', name: 'Netherlands', lat: 52.1, lng: 5.3 },
  belgium: { code: 'BE', name: 'Belgium', lat: 50.5, lng: 4.5 },
  luxembourg: { code: 'LU', name: 'Luxembourg', lat: 49.8, lng: 6.1 },
  switzerland: { code: 'CH', name: 'Switzerland', lat: 46.8, lng: 8.2 },
  austria: { code: 'AT', name: 'Austria', lat: 47.5, lng: 14.6 },
  sweden: { code: 'SE', name: 'Sweden', lat: 60.1, lng: 18.6 },
  norway: { code: 'NO', name: 'Norway', lat: 60.5, lng: 8.5 },
  denmark: { code: 'DK', name: 'Denmark', lat: 56.0, lng: 9.5 },
  finland: { code: 'FI', name: 'Finland', lat: 64.0, lng: 26.0 },
  iceland: { code: 'IS', name: 'Iceland', lat: 64.9, lng: -19.0 },
  estonia: { code: 'EE', name: 'Estonia', lat: 58.6, lng: 25.0 },
  latvia: { code: 'LV', name: 'Latvia', lat: 56.9, lng: 24.6 },
  lithuania: { code: 'LT', name: 'Lithuania', lat: 55.2, lng: 23.9 },
  poland: { code: 'PL', name: 'Poland', lat: 52.0, lng: 19.1 },
  'czech republic': { code: 'CZ', name: 'Czech Republic', lat: 49.8, lng: 15.5 },
  slovakia: { code: 'SK', name: 'Slovakia', lat: 48.7, lng: 19.7 },
  hungary: { code: 'HU', name: 'Hungary', lat: 47.2, lng: 19.5 },
  romania: { code: 'RO', name: 'Romania', lat: 45.9, lng: 24.9 },
  bulgaria: { code: 'BG', name: 'Bulgaria', lat: 42.7, lng: 25.5 },
  greece: { code: 'GR', name: 'Greece', lat: 39.1, lng: 21.8 },
  albania: { code: 'AL', name: 'Albania', lat: 41.2, lng: 20.2 },
  'north macedonia': { code: 'MK', name: 'North Macedonia', lat: 41.6, lng: 21.7 },
  yugoslavia: { code: 'RS', name: 'Serbia', lat: 44.0, lng: 21.0 },
  croatia: { code: 'HR', name: 'Croatia', lat: 45.1, lng: 15.2 },
  slovenia: { code: 'SI', name: 'Slovenia', lat: 46.2, lng: 14.8 },
  'bosnia and herzegovina': { code: 'BA', name: 'Bosnia and Herzegovina', lat: 43.9, lng: 17.7 },
  montenegro: { code: 'ME', name: 'Montenegro', lat: 42.7, lng: 19.4 },
  ukraine: { code: 'UA', name: 'Ukraine', lat: 48.4, lng: 31.2 },
  belarus: { code: 'BY', name: 'Belarus', lat: 53.7, lng: 28.0 },
  moldova: { code: 'MD', name: 'Moldova', lat: 47.4, lng: 28.4 },
  'russian federation': { code: 'RU', name: 'Russia', lat: 61.5, lng: 105.3 },
  malta: { code: 'MT', name: 'Malta', lat: 35.9, lng: 14.4 },
  cyprus: { code: 'CY', name: 'Cyprus', lat: 35.1, lng: 33.4 },

  // ── Middle East / Central Asia ────────────────────────────────────────
  turkey: { code: 'TR', name: 'Turkey', lat: 39.0, lng: 35.2 },
  israel: { code: 'IL', name: 'Israel', lat: 31.0, lng: 34.9 },
  lebanon: { code: 'LB', name: 'Lebanon', lat: 33.9, lng: 35.9 },
  syria: { code: 'SY', name: 'Syria', lat: 35.0, lng: 38.5 },
  jordan: { code: 'JO', name: 'Jordan', lat: 31.3, lng: 36.4 },
  iraq: { code: 'IQ', name: 'Iraq', lat: 33.2, lng: 43.7 },
  iran: { code: 'IR', name: 'Iran', lat: 32.4, lng: 53.7 },
  'saudi arabia': { code: 'SA', name: 'Saudi Arabia', lat: 24.0, lng: 45.1 },
  'united arab emirates': { code: 'AE', name: 'United Arab Emirates', lat: 24.0, lng: 54.0 },
  kuwait: { code: 'KW', name: 'Kuwait', lat: 29.3, lng: 47.5 },
  qatar: { code: 'QA', name: 'Qatar', lat: 25.3, lng: 51.2 },
  oman: { code: 'OM', name: 'Oman', lat: 21.5, lng: 56.0 },
  yemen: { code: 'YE', name: 'Yemen', lat: 15.6, lng: 48.0 },
  armenia: { code: 'AM', name: 'Armenia', lat: 40.1, lng: 45.0 },
  georgia: { code: 'GE', name: 'Georgia', lat: 42.3, lng: 43.4 },
  azerbaijan: { code: 'AZ', name: 'Azerbaijan', lat: 40.1, lng: 47.6 },
  kazakhstan: { code: 'KZ', name: 'Kazakhstan', lat: 48.0, lng: 66.9 },
  uzbekistan: { code: 'UZ', name: 'Uzbekistan', lat: 41.4, lng: 64.6 },

  // ── Asia / Pacific ────────────────────────────────────────────────────
  japan: { code: 'JP', name: 'Japan', lat: 36.2, lng: 138.3 },
  'korea, south': { code: 'KR', name: 'South Korea', lat: 36.5, lng: 127.9 },
  'korea, north': { code: 'KP', name: 'North Korea', lat: 40.3, lng: 127.5 },
  china: { code: 'CN', name: 'China', lat: 35.9, lng: 104.2 },
  'hong kong': { code: 'HK', name: 'Hong Kong', lat: 22.3, lng: 114.2 },
  taiwan: { code: 'TW', name: 'Taiwan', lat: 23.7, lng: 121.0 },
  mongolia: { code: 'MN', name: 'Mongolia', lat: 46.9, lng: 103.8 },
  india: { code: 'IN', name: 'India', lat: 20.6, lng: 79.0 },
  pakistan: { code: 'PK', name: 'Pakistan', lat: 30.4, lng: 69.3 },
  bangladesh: { code: 'BD', name: 'Bangladesh', lat: 23.7, lng: 90.4 },
  'sri lanka': { code: 'LK', name: 'Sri Lanka', lat: 7.9, lng: 80.8 },
  nepal: { code: 'NP', name: 'Nepal', lat: 28.4, lng: 84.1 },
  thailand: { code: 'TH', name: 'Thailand', lat: 15.9, lng: 101.0 },
  vietnam: { code: 'VN', name: 'Vietnam', lat: 14.1, lng: 108.3 },
  cambodia: { code: 'KH', name: 'Cambodia', lat: 12.6, lng: 105.0 },
  laos: { code: 'LA', name: 'Laos', lat: 19.9, lng: 102.5 },
  myanmar: { code: 'MM', name: 'Myanmar', lat: 21.9, lng: 95.9 },
  malaysia: { code: 'MY', name: 'Malaysia', lat: 4.2, lng: 102.0 },
  singapore: { code: 'SG', name: 'Singapore', lat: 1.35, lng: 103.8 },
  indonesia: { code: 'ID', name: 'Indonesia', lat: -0.8, lng: 113.9 },
  philippines: { code: 'PH', name: 'Philippines', lat: 12.9, lng: 121.8 },
  australia: { code: 'AU', name: 'Australia', lat: -25.3, lng: 133.8 },
  'new zealand': { code: 'NZ', name: 'New Zealand', lat: -40.9, lng: 174.9 },
  fiji: { code: 'FJ', name: 'Fiji', lat: -17.7, lng: 178.0 },
  'papua new guinea': { code: 'PG', name: 'Papua New Guinea', lat: -6.3, lng: 143.9 },

  // ── Africa ────────────────────────────────────────────────────────────
  egypt: { code: 'EG', name: 'Egypt', lat: 26.8, lng: 30.8 },
  morocco: { code: 'MA', name: 'Morocco', lat: 31.8, lng: -7.1 },
  algeria: { code: 'DZ', name: 'Algeria', lat: 28.0, lng: 1.7 },
  tunisia: { code: 'TN', name: 'Tunisia', lat: 33.9, lng: 9.5 },
  libya: { code: 'LY', name: 'Libya', lat: 26.3, lng: 17.2 },
  sudan: { code: 'SD', name: 'Sudan', lat: 12.9, lng: 30.2 },
  ethiopia: { code: 'ET', name: 'Ethiopia', lat: 9.1, lng: 40.5 },
  somalia: { code: 'SO', name: 'Somalia', lat: 5.2, lng: 46.2 },
  kenya: { code: 'KE', name: 'Kenya', lat: -0.0, lng: 37.9 },
  tanzania: { code: 'TZ', name: 'Tanzania', lat: -6.4, lng: 34.9 },
  uganda: { code: 'UG', name: 'Uganda', lat: 1.4, lng: 32.3 },
  rwanda: { code: 'RW', name: 'Rwanda', lat: -1.9, lng: 29.9 },
  senegal: { code: 'SN', name: 'Senegal', lat: 14.5, lng: -14.5 },
  gambia: { code: 'GM', name: 'Gambia', lat: 13.4, lng: -15.3 },
  mali: { code: 'ML', name: 'Mali', lat: 17.6, lng: -4.0 },
  guinea: { code: 'GN', name: 'Guinea', lat: 9.9, lng: -9.7 },
  'sierra leone': { code: 'SL', name: 'Sierra Leone', lat: 8.5, lng: -11.8 },
  liberia: { code: 'LR', name: 'Liberia', lat: 6.4, lng: -9.4 },
  "côte d'ivoire": { code: 'CI', name: "Côte d'Ivoire", lat: 7.5, lng: -5.5 },
  ghana: { code: 'GH', name: 'Ghana', lat: 7.9, lng: -1.0 },
  togo: { code: 'TG', name: 'Togo', lat: 8.6, lng: 0.8 },
  benin: { code: 'BJ', name: 'Benin', lat: 9.3, lng: 2.3 },
  'burkina faso': { code: 'BF', name: 'Burkina Faso', lat: 12.2, lng: -1.6 },
  niger: { code: 'NE', name: 'Niger', lat: 17.6, lng: 8.1 },
  nigeria: { code: 'NG', name: 'Nigeria', lat: 9.1, lng: 8.7 },
  cameroon: { code: 'CM', name: 'Cameroon', lat: 7.4, lng: 12.3 },
  gabon: { code: 'GA', name: 'Gabon', lat: -0.8, lng: 11.6 },
  congo: { code: 'CG', name: 'Congo', lat: -0.2, lng: 15.8 },
  'congo, dr': { code: 'CD', name: 'DR Congo', lat: -4.0, lng: 21.8 },
  angola: { code: 'AO', name: 'Angola', lat: -11.2, lng: 17.9 },
  zambia: { code: 'ZM', name: 'Zambia', lat: -13.1, lng: 27.8 },
  zimbabwe: { code: 'ZW', name: 'Zimbabwe', lat: -19.0, lng: 29.2 },
  mozambique: { code: 'MZ', name: 'Mozambique', lat: -18.7, lng: 35.5 },
  madagascar: { code: 'MG', name: 'Madagascar', lat: -18.8, lng: 47.0 },
  mauritius: { code: 'MU', name: 'Mauritius', lat: -20.3, lng: 57.6 },
  'cabo verde': { code: 'CV', name: 'Cabo Verde', lat: 16.0, lng: -24.0 },
  'south africa': { code: 'ZA', name: 'South Africa', lat: -30.6, lng: 22.9 },
  namibia: { code: 'NA', name: 'Namibia', lat: -22.9, lng: 18.5 },
  botswana: { code: 'BW', name: 'Botswana', lat: -22.3, lng: 24.7 },
};

// ISO code → geo entry (first table entry wins).
const BY_CODE: Record<string, CountryGeo> = {};
for (const geo of Object.values(TABLE)) {
  if (!BY_CODE[geo.code]) BY_CODE[geo.code] = geo;
}

export function geoForCountry(name: string): CountryGeo | null {
  const key = name.trim().toLowerCase();
  const canonical = ALIASES[key] ?? key;
  return TABLE[canonical] ?? null;
}

/** Lookup by ISO 3166-1 alpha-2 code (e.g. the MusicBrainz `country` field). */
export function geoForISO(code: string): CountryGeo | null {
  return BY_CODE[code.trim().toUpperCase()] ?? null;
}
