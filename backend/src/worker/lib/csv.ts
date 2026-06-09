import { parse } from 'csv-parse/sync';

/** A row of a Discogs collection CSV export (exact header names). */
export interface DiscogsCsvRow {
  'Catalog#'?: string;
  Artist?: string;
  Title?: string;
  Label?: string;
  Format?: string;
  Rating?: string;
  Released?: string;
  release_id?: string;
  CollectionFolder?: string;
  'Date Added'?: string;
  'Collection Media Condition'?: string;
  'Collection Sleeve Condition'?: string;
  'Collection Notes'?: string;
  [key: string]: string | undefined;
}

/**
 * Parse a Discogs collection CSV export. Uses a real CSV parser (the flattened
 * Label/Format/Catalog# cells may contain commas inside quoted fields).
 */
export function parseDiscogsCsv(content: Buffer | string): DiscogsCsvRow[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  }) as DiscogsCsvRow[];
}

export function parseRating(value?: string): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return Number.isNaN(n) || n <= 0 ? null : Math.min(n, 5);
}

export function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}
