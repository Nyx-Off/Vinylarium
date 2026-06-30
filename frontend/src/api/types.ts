export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  isAdmin: boolean;
}

export interface Me extends PublicUser {
  preferences: Record<string, unknown>;
  // Per-user Discogs credentials (Settings → profile, collection sync).
  // Optional: only /auth/me returns them, the login response doesn't.
  discogsUsername?: string | null;
  discogsToken?: string | null;
}

export type EnrichmentStatus =
  | 'PENDING'
  | 'QUEUED'
  | 'ENRICHING'
  | 'ENRICHED'
  | 'FAILED'
  | 'MANUAL'
  | 'SKIPPED';

export interface ReleaseListItem {
  id: string;
  title: string;
  artistDisplay: string;
  year: number | null;
  decade: number | null;
  country: string | null;
  catalogNumber: string | null;
  rating: number | null;
  hidden: boolean;
  coverUrl: string | null;
  enrichmentStatus: EnrichmentStatus;
  isLive: boolean;
  isStudio: boolean;
  isCompilation: boolean;
  isSpecialEdition: boolean;
  storageLocationId: string | null;
  storageSlot: string | null;
}

export interface ReleaseListResponse {
  items: ReleaseListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ArtistRef {
  id: string;
  name: string;
  imageUrl: string | null;
}

export interface Credit {
  id: string;
  artist: ArtistRef;
  role: string;
  category: string;
  detail: string | null;
  tracks: string | null;
}

export interface Track {
  id: string;
  position: string | null;
  title: string;
  duration: string | null;
  type: string;
}

export interface ReleaseDetail {
  id: string;
  source: string;
  enrichmentStatus: EnrichmentStatus;
  enrichmentError: string | null;
  discogsReleaseId: number | null;
  discogsMasterId: number | null;
  discogsUri: string | null;
  title: string;
  artistDisplay: string;
  year: number | null; // original release year of the music (master)
  pressingYear: number | null; // year of THIS pressing
  decade: number | null;
  hidden: boolean;
  released: string | null;
  country: string | null;
  catalogNumber: string | null;
  notes: string | null;
  rating: number | null;
  mediaCondition: string | null;
  sleeveCondition: string | null;
  collectionFolder: string | null;
  coverUrl: string | null;
  backCoverUrl: string | null;
  flags: {
    isStudio: boolean;
    isLive: boolean;
    isCompilation: boolean;
    isReissue: boolean;
    isRemaster: boolean;
    isSpecialEdition: boolean;
  };
  artists: (ArtistRef & { anv: string | null; joinRel: string | null })[];
  lineup: {
    artistId: string;
    artistName: string;
    members: {
      artistId: string | null;
      name: string;
      attributes: string[];
      beginDate: string | null;
      endDate: string | null;
      ended: boolean;
    }[];
  }[];
  credits: Credit[];
  musicians: Credit[];
  singers: Credit[];
  authors: Credit[];
  producers: Credit[];
  labels: { id: string; name: string; catno: string | null }[];
  genres: string[];
  styles: string[];
  formats: { name: string; qty: string | null; text: string | null; descriptions: string[] }[];
  tracklist: Track[];
  images: { id: string; type: string; url: string | null; width: number | null; height: number | null }[];
  lyrics: { id: string; trackId: string | null; text: string; source: string; sourceUrl: string | null }[];
  anecdotes: { id: string; title: string | null; body: string; source: string; sourceUrl: string | null }[];
  identifiers: { type: string; value: string; description: string | null }[];
  externalLinks: { source: string; url: string }[];
  tags: { id: string; name: string; color: string | null }[];
  storage: {
    id: string;
    label: string;
    slot: string | null;
    furnitureId: string | null;
    cellX: number | null;
    cellY: number | null;
    position: number | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Facets {
  genres: { name: string; count: number }[];
  styles: { name: string; count: number }[];
  labels: { name: string; count: number }[];
  tags: { name: string; color: string | null; count: number }[];
  instruments: { id: string; name: string; count: number }[];
  storageLocations: { id: string; label: string; count: number }[];
  countries: { name: string; count: number }[];
  formats: { name: string; count: number }[];
  decades: { decade: number; count: number }[];
}

export interface StorageLocation {
  id: string;
  label: string;
  furniture: string | null;
  shelf: string | null;
  column: string | null;
  row: string | null;
  bin: string | null;
  note: string | null;
  sortOrder: number;
  releaseCount: number;
}

export type FurnitureType = 'CUBES' | 'CUBE' | 'TOWER' | 'BAC' | 'VITRINE' | 'CHEVALET' | 'SHELF' | 'FRAME';
export type FurnitureMount = 'FLOOR' | 'WALL_BACK' | 'WALL_LEFT';

export interface FurnitureCell {
  id: string;
  cellX: number;
  cellY: number;
  label: string;
  note: string | null;
  releaseCount: number;
  covers: string[];
}

export interface Furniture {
  id: string;
  name: string;
  type: FurnitureType;
  posX: number;
  posY: number;
  posZ: number;
  rotation: number;
  mount: FurnitureMount;
  width: number;
  height: number;
  depth: number;
  columns: number;
  rows: number;
  color: string | null;
  locked: boolean;
  sortOrder: number;
  cells: FurnitureCell[];
}

export interface Room {
  width: number;
  depth: number;
}

export interface CellRelease {
  id: string;
  title: string;
  artistDisplay: string;
  year: number | null;
  coverUrl: string | null;
  position: number;
}

export interface CellContents {
  cell: { id: string; label: string; note: string | null } | null;
  releases: CellRelease[];
}

export interface ImportJob {
  id: string;
  filename: string;
  status: 'PENDING' | 'PARSING' | 'ENRICHING' | 'COMPLETED' | 'FAILED';
  totalRows: number;
  processedRows: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface Stats {
  totals: {
    releases: number;
    artists: number;
    labels: number;
    live: number;
    pendingEnrichment: number;
    enriched: number;
    withLyrics: number;
    rated: number;
    hidden: number;
  };
  byDecade: { decade: number; count: number }[];
  topGenres: { name: string; count: number }[];
  topCountries: { name: string; count: number }[];
  topArtists: { id: string; name: string; count: number }[];
  topLabels: { id: string; name: string; count: number }[];
  ratings: { rating: number; count: number }[];
  formats: { name: string; count: number }[];
}

export interface Origin {
  name: string;
  code: string;
  lat: number;
  lng: number;
  count: number;
}

export type OriginMode = 'artists' | 'pressing';

export interface OriginsResponse {
  mode: OriginMode;
  origins: Origin[];
  artistsResolved: number;
  artistsPending: number;
}

export interface TimelineRelease {
  id: string;
  title: string;
  artist: string;
  year: number;
  coverUrl: string | null;
}

export interface TimelineResponse {
  releases: TimelineRelease[];
  undated: number;
}

export interface LyricMatch {
  releaseId: string;
  title: string;
  artistDisplay: string;
  coverUrl: string | null;
  trackTitle: string | null;
  trackPosition: string | null;
  snippet: string;
}

export interface ReenrichStatus {
  inProgress: boolean;
  waiting: number;
  active: number;
  pending: number;
  missingDiscogs: number;
  missingGenius: number;
  staleYears: number;
  lyrics: { inProgress: boolean; waiting: number; active: number };
}

export interface Integration {
  name: string;
  configured: boolean;
  ok: boolean;
  detail: string;
}

export interface ArtistSearchResult {
  id: string;
  name: string;
  imageUrl: string | null;
  releaseCount: number;
  creditCount: number;
}

export interface BandMember {
  id: string;
  artistId: string | null; // set when the member exists in the library
  name: string;
  attributes: string[]; // instruments / roles; "original" = founding member
  beginDate: string | null;
  endDate: string | null;
  ended: boolean;
}

export interface ArtistDetail {
  id: string;
  name: string;
  realName: string | null;
  profile: string | null;
  imageUrl: string | null;
  discogsUri: string | null;
  mbid: string | null;
  type: string | null; // "Group" | "Person" | …
  beginDate: string | null;
  endDate: string | null;
  origin: { code: string; name: string } | null;
  originStatus: string;
  relationsStatus: string;
  members: BandMember[];
  memberOf: { artistId: string; name: string }[];
  releases: ReleaseListItem[];
  appearsOn: (ReleaseListItem & { roles: string[] })[];
}

// ── Spotify ───────────────────────────────────────────────────────────────────

export interface SpotifyStatus {
  configured: boolean;
  connected: boolean;
  name: string | null;
  redirectUri: string;
}

export interface SpotifyNowPlaying {
  connected: boolean;
  playing: boolean;
  title?: string;
  artist?: string;
  album?: string;
  coverUrl?: string | null;
  trackUrl?: string | null;
  progressMs?: number;
  durationMs?: number;
}

// ── System update ────────────────────────────────────────────────────────────

export interface UpdateCommit {
  sha: string;
  message: string;
  date: string | null;
}

export interface UpdateCheck {
  checkedAt: string;
  currentSha: string | null;
  currentVersion: string | null;
  latestSha: string | null;
  latestVersion: string | null;
  updateAvailable: boolean;
  behindBy: number | null;
  commits: UpdateCommit[];
  error: string | null;
}

export interface SystemVersion {
  currentSha: string | null;
  currentVersion: string | null;
  check: UpdateCheck | null;
}

export interface UpdateStatus {
  state: 'idle' | 'requested' | 'running' | 'done' | 'error';
  detail: string | null;
  at: string | null;
  log: string[];
}

// ── Discogs live search (add-a-disc page) ────────────────────────────────────

export interface DiscogsSearchResult {
  id: number;
  title: string; // "Artist - Title"
  year: string | null;
  country: string | null;
  formats: string[];
  labels: string[];
  catno: string | null;
  thumb: string | null;
  existingId: string | null; // already in the library?
}
