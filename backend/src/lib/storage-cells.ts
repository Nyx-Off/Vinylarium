/**
 * Human label for a 3D-furniture cell, e.g. "Tour vinyles 1 · bac",
 * "Vitrine · étagère 2", "Kallax · colonne 2 · rangée 1". Rows/shelves are
 * counted from the TOP (1 = highest), columns left→right; single-cell pieces are
 * just their name. Mirror of `cellLabel` in the frontend's lib/furniture.ts.
 *
 * Shared by the storage routes (cell creation) and the backup restore.
 */
export function cellLabel(
  f: { name: string; type: string; columns: number; rows: number },
  x: number,
  y: number,
): string {
  if (f.type === 'TOWER') {
    const nCub = Math.max(1, f.rows - 1);
    return y >= nCub ? `${f.name} · bac` : `${f.name} · casier ${nCub - y}`;
  }
  if (f.type === 'VITRINE' && f.rows > 1) return `${f.name} · étagère ${f.rows - y}`;
  if (f.type === 'CUBES') {
    const parts: string[] = [];
    if (f.columns > 1) parts.push(`colonne ${x + 1}`);
    if (f.rows > 1) parts.push(`rangée ${f.rows - y}`);
    return parts.length ? `${f.name} · ${parts.join(' · ')}` : f.name;
  }
  return f.name;
}
