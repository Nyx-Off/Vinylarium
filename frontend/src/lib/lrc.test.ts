import { describe, expect, it } from 'vitest';
import { activeLineIndex, parseLrc } from './lrc';

describe('parseLrc', () => {
  it('parses timestamps and orders lines', () => {
    const lines = parseLrc('[00:12.50]Hello\n[00:05.00]First\n[invalid]skip');
    expect(lines).toEqual([
      { timeMs: 5000, text: 'First' },
      { timeMs: 12500, text: 'Hello' },
    ]);
  });
  it('expands a line carrying several stamps', () => {
    const lines = parseLrc('[00:01.00][00:10.00]Chorus');
    expect(lines.map((l) => l.timeMs)).toEqual([1000, 10000]);
    expect(lines.every((l) => l.text === 'Chorus')).toBe(true);
  });
  it('keeps blank lyric lines (musical breaks)', () => {
    const lines = parseLrc('[00:03.00]');
    expect(lines).toEqual([{ timeMs: 3000, text: '' }]);
  });
});

describe('activeLineIndex', () => {
  const lines = parseLrc('[00:00.00]a\n[00:05.00]b\n[00:10.00]c');
  it('returns -1 before the first line', () => {
    expect(activeLineIndex(lines, -1)).toBe(-1);
  });
  it('returns the last line at or before the time', () => {
    expect(activeLineIndex(lines, 0)).toBe(0);
    expect(activeLineIndex(lines, 4999)).toBe(0);
    expect(activeLineIndex(lines, 5000)).toBe(1);
    expect(activeLineIndex(lines, 999999)).toBe(2);
  });
});
