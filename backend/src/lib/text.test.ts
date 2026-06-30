import { describe, expect, it } from 'vitest';
import {
  deriveDecade,
  deriveVersionFlags,
  durationToSeconds,
  isPlaceholderArtist,
  parseYear,
  sortName,
} from './text';

describe('isPlaceholderArtist', () => {
  it('flags Discogs placeholders (accent/case/punctuation-insensitive)', () => {
    for (const n of ['Various', 'various artists', 'VA', 'Unknown Artist', 'No Artist', '', null]) {
      expect(isPlaceholderArtist(n)).toBe(true);
    }
  });
  it('keeps real artists', () => {
    for (const n of ['Miles Davis', 'The Beatles', 'Daft Punk']) {
      expect(isPlaceholderArtist(n)).toBe(false);
    }
  });
});

describe('sortName', () => {
  it('drops a leading article and punctuation', () => {
    expect(sortName('The Beatles')).toBe('beatles');
    expect(sortName('Les Rita Mitsouko')).toBe('rita mitsouko');
    expect(sortName('!!!')).toBe('');
  });
});

describe('parseYear / deriveDecade', () => {
  it('extracts a plausible year from a released string', () => {
    expect(parseYear('1987')).toBe(1987);
    expect(parseYear('1987-07-00')).toBe(1987);
    expect(parseYear('n/a')).toBeNull();
    expect(parseYear('0007')).toBeNull(); // implausible
  });
  it('rounds down to the decade', () => {
    expect(deriveDecade(1987)).toBe(1980);
    expect(deriveDecade(2000)).toBe(2000);
    expect(deriveDecade(null)).toBeNull();
  });
});

describe('durationToSeconds', () => {
  it('parses mm:ss and hh:mm:ss', () => {
    expect(durationToSeconds('3:45')).toBe(225);
    expect(durationToSeconds('1:00:00')).toBe(3600);
    expect(durationToSeconds('')).toBeNull();
    expect(durationToSeconds('x:y')).toBeNull();
  });
});

describe('deriveVersionFlags', () => {
  it('treats studio as the absence of live', () => {
    expect(deriveVersionFlags(['Album']).isStudio).toBe(true);
    const live = deriveVersionFlags(['Live', 'Album']);
    expect(live.isLive).toBe(true);
    expect(live.isStudio).toBe(false);
  });
  it('detects reissue/remaster/special edition', () => {
    expect(deriveVersionFlags(['Reissue']).isReissue).toBe(true);
    expect(deriveVersionFlags(['Repress']).isReissue).toBe(true);
    expect(deriveVersionFlags(['Remastered']).isRemaster).toBe(true);
    expect(deriveVersionFlags(['Deluxe Edition']).isSpecialEdition).toBe(true);
  });
});
