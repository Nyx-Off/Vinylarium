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
  year: number | null;
  decade: number | null;
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
  images: { id: string; type: string; url: string | null }[];
  lyrics: { id: string; trackId: string | null; text: string; source: string; sourceUrl: string | null }[];
  anecdotes: { id: string; title: string | null; body: string; source: string; sourceUrl: string | null }[];
  identifiers: { type: string; value: string; description: string | null }[];
  externalLinks: { source: string; url: string }[];
  tags: { id: string; name: string; color: string | null }[];
  storage: { id: string; label: string; slot: string | null } | null;
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
  totals: { releases: number; artists: number; labels: number; live: number; pendingEnrichment: number };
  byDecade: { decade: number; count: number }[];
  topGenres: { name: string; count: number }[];
  topCountries: { name: string; count: number }[];
}

export interface Origin {
  name: string;
  code: string;
  lat: number;
  lng: number;
  count: number;
}

export interface ReenrichStatus {
  inProgress: boolean;
  waiting: number;
  active: number;
  pending: number;
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
