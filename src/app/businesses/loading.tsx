export default function BusinessesLoading() {
  return <main className="page-container max-w-[1050px] animate-pulse"><div className="h-7 w-44 rounded bg-surface-muted" /><div className="mt-3 h-4 w-80 rounded bg-surface-muted" /><div className="mt-7 h-9 max-w-md rounded bg-surface-muted" /><div className="mt-4 space-y-3">{Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-[70px] rounded-lg border border-border bg-surface" />)}</div></main>;
}
