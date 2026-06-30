import { describe, expect, it } from 'vitest';
import { RoleCategory } from '@prisma/client';
import { categorizeRole, parseRole, splitRoles } from './discogs-roles';

describe('splitRoles', () => {
  it('splits a comma list and trims', () => {
    expect(splitRoles('Bass, Vocals , Guitar')).toEqual(['Bass', 'Vocals', 'Guitar']);
    expect(splitRoles('')).toEqual([]);
  });
});

describe('parseRole', () => {
  it('separates a bracketed instrument model', () => {
    expect(parseRole('Synthesizer [Yamaha DX7]')).toEqual({ base: 'Synthesizer', detail: 'Yamaha DX7' });
    expect(parseRole('Bass')).toEqual({ base: 'Bass', detail: null });
  });
});

describe('categorizeRole', () => {
  it('categorises via heuristics on the base role', () => {
    expect(categorizeRole('Bass Guitar')).toBe(RoleCategory.INSTRUMENT);
    expect(categorizeRole('Lead Vocals')).toBe(RoleCategory.VOCAL);
    expect(categorizeRole('Produced By')).toBe(RoleCategory.PRODUCTION);
    expect(categorizeRole('Written-By')).toBe(RoleCategory.WRITING);
    expect(categorizeRole('Mastered By')).toBe(RoleCategory.TECHNICAL);
  });
});
