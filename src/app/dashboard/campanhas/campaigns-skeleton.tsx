export function CampanhasTreeSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <p className="text-sm text-muted-foreground">Carregando insights…</p>
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="glass animate-pulse rounded-[var(--radius)] border p-3"
          >
            <div className="h-4 w-48 max-w-full rounded bg-muted" />
            <div className="mt-2 h-3 w-72 max-w-full rounded bg-muted/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
