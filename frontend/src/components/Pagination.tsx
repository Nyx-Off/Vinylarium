const PAGE_SIZES = [30, 60, 120, 240];

/** "1 … 4 5 6 … 12" — current page ±1, first and last always visible. */
function pageNumbers(page: number, pageCount: number): (number | '…')[] {
  const wanted = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const nums = [...wanted].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  let prev = 0;
  for (const n of nums) {
    if (n - prev > 1) out.push('…');
    out.push(n);
    prev = n;
  }
  return out;
}

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      <button
        className="btn-outline px-3"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Page précédente"
      >
        ←
      </button>
      {pageNumbers(page, pageCount).map((n, i) =>
        n === '…' ? (
          <span key={`gap-${i}`} className="px-1 text-sm text-mocha">
            …
          </span>
        ) : (
          <button
            key={n}
            onClick={() => onPage(n)}
            aria-current={n === page ? 'page' : undefined}
            className={`min-w-[2.25rem] rounded-full px-2 py-1.5 text-sm font-medium transition-colors ${
              n === page ? 'bg-accent text-cream' : 'text-mocha hover:bg-ink/10'
            }`}
          >
            {n}
          </button>
        ),
      )}
      <button
        className="btn-outline px-3"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Page suivante"
      >
        →
      </button>
    </div>
  );
}

export function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <select
      className="input w-auto"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      title="Disques par page"
    >
      {PAGE_SIZES.map((n) => (
        <option key={n} value={n}>
          {n} / page
        </option>
      ))}
    </select>
  );
}

export const DEFAULT_PAGE_SIZE = 60;
export const ALLOWED_PAGE_SIZES = PAGE_SIZES;
