import { useQuery } from '@tanstack/react-query';
import { api } from './client';
import * as T from './types';

export interface ReleaseFilters {
  q?: string;
  artistId?: string;
  role?: string;
  roleCategory?: string;
  genre?: string;
  style?: string;
  label?: string;
  country?: string;
  origin?: string; // ISO code — artist origin country
  tag?: string;
  storageLocationId?: string;
  year?: number;
  decade?: number;
  live?: boolean;
  studio?: boolean;
  compilation?: boolean;
  special?: boolean;
  reissue?: boolean;
  remaster?: boolean;
  format?: string; // "LP", "EP", "45 RPM"…
  hidden?: boolean; // ONLY hidden releases
  includeHidden?: boolean; // mix hidden in (search)
  missing?: string; // comma list: "year,cover,lyrics,country,genre,storage,rating,credits,tracklist"
  enrichmentStatus?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function cleanParams(f: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    out[k] = v;
  }
  return out;
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => (await api.get<{ users: T.PublicUser[] }>('/users')).data.users,
  });
}

export function useSetup() {
  return useQuery({
    queryKey: ['setup'],
    queryFn: async () => (await api.get<{ needsSetup: boolean }>('/auth/setup')).data,
  });
}

export function useReleases(filters: ReleaseFilters) {
  return useQuery({
    queryKey: ['releases', filters],
    queryFn: async () =>
      (
        await api.get<T.ReleaseListResponse>('/releases', {
          params: cleanParams(filters as Record<string, unknown>),
        })
      ).data,
  });
}

export function useRelease(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: ['release', id],
    queryFn: async () => (await api.get<T.ReleaseDetail>(`/releases/${id}`)).data,
  });
}

export function useFacets() {
  return useQuery({
    queryKey: ['facets'],
    queryFn: async () => (await api.get<T.Facets>('/search/facets')).data,
  });
}

export function useStorageLocations() {
  return useQuery({
    queryKey: ['storage'],
    queryFn: async () =>
      (await api.get<{ locations: T.StorageLocation[] }>('/storage')).data.locations,
  });
}

export function useImportJobs() {
  return useQuery({
    queryKey: ['imports'],
    queryFn: async () => (await api.get<{ jobs: T.ImportJob[] }>('/import')).data.jobs,
  });
}

export function useImportJob(id?: string, poll = false) {
  return useQuery({
    enabled: !!id,
    queryKey: ['import', id],
    // Poll while the job runs, stop once it reaches a terminal state.
    refetchInterval: poll
      ? (query) =>
          query.state.data && ['COMPLETED', 'FAILED'].includes(query.state.data.status)
            ? false
            : 1500
      : false,
    queryFn: async () => (await api.get<T.ImportJob>(`/import/${id}`)).data,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await api.get<T.Stats>('/stats')).data,
  });
}

export function useOrigins(mode: T.OriginMode = 'artists') {
  return useQuery({
    queryKey: ['origins', mode],
    queryFn: async () =>
      (await api.get<T.OriginsResponse>('/stats/origins', { params: { mode } })).data,
  });
}

export function useTimeline() {
  return useQuery({
    queryKey: ['timeline'],
    queryFn: async () => (await api.get<T.TimelineResponse>('/stats/timeline')).data,
  });
}

export function useReenrichStatus() {
  return useQuery({
    queryKey: ['reenrich-status'],
    refetchInterval: 3000,
    queryFn: async () =>
      (await api.get<T.ReenrichStatus>('/releases/reenrich-status')).data,
  });
}

export function useIntegrations() {
  return useQuery({
    queryKey: ['integrations'],
    refetchOnWindowFocus: false,
    queryFn: async () =>
      (await api.get<{ integrations: T.Integration[] }>('/stats/integrations')).data.integrations,
  });
}

export function useArtist(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: ['artist', id],
    queryFn: async () => (await api.get<T.ArtistDetail>(`/artists/${id}`)).data,
  });
}

export function useArtistSearch(q: string) {
  return useQuery({
    queryKey: ['artists', q],
    queryFn: async () =>
      (await api.get<{ artists: T.ArtistSearchResult[] }>('/search/artists', { params: { q } })).data
        .artists,
  });
}

export function useSystemVersion() {
  return useQuery({
    queryKey: ['system-version'],
    refetchOnWindowFocus: false,
    queryFn: async () => (await api.get<T.SystemVersion>('/system/version')).data,
  });
}
