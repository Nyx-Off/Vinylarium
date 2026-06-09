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
    refetchInterval: poll ? 1500 : false,
    queryFn: async () => (await api.get<T.ImportJob>(`/import/${id}`)).data,
  });
}

export function useStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async () => (await api.get<T.Stats>('/stats')).data,
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
