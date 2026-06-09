import { RoleCategory } from '@prisma/client';

/**
 * Discogs encodes the *instrument* inside the free-text credit `role` string
 * (e.g. extraartists[].role = "Bass" or "Producer, Written-By"). We normalise
 * each atomic role into a category so the app can derive:
 *   - musicians      -> INSTRUMENT roles
 *   - singers        -> VOCAL roles
 *   - authors        -> WRITING roles
 *   - producers      -> PRODUCTION roles
 * and answer queries like "all vinyls where artist X plays Bass".
 */

// Canonical buckets keyed by category. Matching is case-insensitive and ignores
// a trailing qualifier in brackets (Discogs sometimes writes "Bass [Electric]").
const ROLE_TABLE: Record<RoleCategory, string[]> = {
  [RoleCategory.INSTRUMENT]: [
    'Bass', 'Bass Guitar', 'Double Bass', 'Drums', 'Percussion', 'Guitar',
    'Acoustic Guitar', 'Electric Guitar', 'Slide Guitar', 'Rhythm Guitar',
    'Lead Guitar', 'Piano', 'Keyboards', 'Organ', 'Synthesizer', 'Synth',
    'Saxophone', 'Trumpet', 'Trombone', 'Flute', 'Clarinet', 'Violin', 'Viola',
    'Cello', 'Harmonica', 'Banjo', 'Mandolin', 'Harp', 'Accordion', 'Vibraphone',
    'Marimba', 'Strings', 'Horns', 'Brass', 'Woodwind', 'Cornet', 'Tuba',
    'Fiddle', 'Ukulele', 'Sitar', 'Tabla', 'Congas', 'Bongos', 'Timbales',
    'Programmed By', 'Drum Machine', 'Sampler', 'Turntables', 'Scratches',
  ],
  [RoleCategory.VOCAL]: [
    'Vocals', 'Lead Vocals', 'Backing Vocals', 'Choir', 'Voice', 'Rap',
    'Featuring', 'Chorus', 'Vocoder',
  ],
  [RoleCategory.WRITING]: [
    'Written-By', 'Composed By', 'Lyrics By', 'Music By', 'Songwriter',
    'Writer', 'Arranged By', 'Adapted By', 'Words By', 'Libretto By',
  ],
  [RoleCategory.PRODUCTION]: [
    'Producer', 'Co-producer', 'Executive-Producer', 'Executive Producer',
    'Reissue Producer', 'Additional Production', 'Remix', 'Remixer',
  ],
  [RoleCategory.TECHNICAL]: [
    'Mixed By', 'Mastered By', 'Engineer', 'Recorded By', 'Mixing Engineer',
    'Mastering Engineer', 'Lacquer Cut By', 'Edited By', 'Sound', 'Programming',
    'Design', 'Artwork', 'Artwork By', 'Photography', 'Photography By',
    'Illustration', 'Liner Notes', 'Layout', 'Sleeve', 'Cover',
    'Mould SID Code', 'Mastered At',
  ],
  [RoleCategory.PERFORMANCE]: [
    'Performer', 'Orchestra', 'Conductor', 'Ensemble', 'Band', 'Soloist',
    'Featuring [Performer]', 'Directed By',
  ],
  [RoleCategory.OTHER]: [],
};

// Build a lookup once: normalised-role -> category.
const ROLE_LOOKUP = new Map<string, RoleCategory>();
for (const [category, names] of Object.entries(ROLE_TABLE)) {
  for (const name of names) {
    ROLE_LOOKUP.set(name.toLowerCase(), category as RoleCategory);
  }
}

/** All known canonical roles with their category, for seeding the Role table. */
export function allKnownRoles(): { name: string; category: RoleCategory }[] {
  const out: { name: string; category: RoleCategory }[] = [];
  for (const [category, names] of Object.entries(ROLE_TABLE)) {
    for (const name of names) out.push({ name, category: category as RoleCategory });
  }
  return out;
}

/** Split a Discogs role string ("Producer, Written-By") into atomic roles. */
export function splitRoles(raw: string): string[] {
  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0);
}

/** Strip a bracketed qualifier: "Bass [Electric]" -> { base: "Bass", detail: "Electric" }. */
export function parseRole(role: string): { base: string; detail: string | null } {
  const m = role.match(/^(.*?)\s*\[(.*?)\]\s*$/);
  if (m) {
    return { base: m[1].trim(), detail: m[2].trim() || null };
  }
  return { base: role.trim(), detail: null };
}

/** Categorise an atomic role name. */
export function categorizeRole(role: string): RoleCategory {
  const { base } = parseRole(role);
  const exact = ROLE_LOOKUP.get(base.toLowerCase());
  if (exact) return exact;

  // Heuristic fallbacks for unseen variants.
  const lower = base.toLowerCase();
  if (lower.includes('vocal') || lower.includes('voice')) return RoleCategory.VOCAL;
  if (lower.includes('produc')) return RoleCategory.PRODUCTION;
  if (lower.includes('written') || lower.includes('compos') || lower.includes('lyric'))
    return RoleCategory.WRITING;
  if (
    lower.includes('engineer') ||
    lower.includes('master') ||
    lower.includes('mix') ||
    lower.includes('design') ||
    lower.includes('photo') ||
    lower.includes('artwork')
  )
    return RoleCategory.TECHNICAL;
  if (lower.includes('guitar') || lower.includes('bass') || lower.includes('drum'))
    return RoleCategory.INSTRUMENT;
  return RoleCategory.OTHER;
}
