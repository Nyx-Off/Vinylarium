export function Rating({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-0.5 text-gold" aria-label={`${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} className={i < value ? 'opacity-100' : 'opacity-25'}>
          ★
        </span>
      ))}
    </div>
  );
}
