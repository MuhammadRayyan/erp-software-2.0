/**
 * Statements created (cache misses) after which a long-lived connection is
 * replaced. Each retained statement costs ~3 KB of native memory that is only
 * released when its connection closes, so 20k ≈ 60 MB per connection.
 */
export const STATEMENT_CHURN_RECYCLE_THRESHOLD = Number.parseInt(
  process.env.ERP_SQLITE_RECYCLE_AFTER_STATEMENTS ?? "",
  10,
) || 20_000;

/** How long a retired connection stays open for in-flight requests. */
export const RETIRED_CONNECTION_CLOSE_DELAY_MS = 60_000;
