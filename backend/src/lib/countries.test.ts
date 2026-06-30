import { describe, expect, it } from 'vitest';
import { geoForCountry, geoForISO } from './countries';

describe('geoForCountry', () => {
  it('resolves names and Discogs shorthand to an ISO code', () => {
    expect(geoForCountry('France')?.code).toBe('FR');
    expect(geoForCountry('USA')?.code).toBe('US');
    expect(geoForCountry('us')?.code).toBe('US');
    expect(geoForCountry('UK')?.code).toBe('GB');
  });
  it('returns null for non-geographic values', () => {
    expect(geoForCountry('Worldwide')).toBeNull();
    expect(geoForCountry('Europe')).toBeNull();
  });
});

describe('geoForISO', () => {
  it('looks up by alpha-2 code, case-insensitively', () => {
    expect(geoForISO('FR')?.name).toBe('France');
    expect(geoForISO('fr')?.code).toBe('FR');
    expect(geoForISO('ZZ')).toBeNull();
  });
});
