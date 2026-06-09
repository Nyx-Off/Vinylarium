export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-mocha">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-ink/15 border-t-accent" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}
