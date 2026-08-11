export default function Loading() {
  return <div className="page-container animate-pulse"><div className="h-7 w-44 rounded bg-surface-muted" /><div className="mt-3 h-4 w-72 rounded bg-surface-muted" /><div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-28 rounded-lg border border-border bg-surface" />)}</div><div className="mt-5 h-72 rounded-lg border border-border bg-surface" /></div>;
}
