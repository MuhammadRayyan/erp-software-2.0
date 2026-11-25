/** Outcome of a bulk operation; partial success is reported per document. */
export type BatchActionResult = {
  successCount: number;
  postedCount?: number;
  pendingApprovalCount?: number;
  failedCount: number;
  errors: { id: string; number?: string; error: string }[];
};

/**
 * Applies `apply` to each id independently, so one failing document (locked
 * period, reconciled payment, …) does not stop the rest.
 */
export function runBatch(
  ids: readonly string[],
  apply: (id: string) => void,
  numberOf?: (id: string) => string | undefined,
): BatchActionResult {
  const result: BatchActionResult = { successCount: 0, failedCount: 0, errors: [] };
  for (const id of new Set(ids)) {
    try {
      apply(id);
      result.successCount += 1;
    } catch (error) {
      result.failedCount += 1;
      let number: string | undefined;
      try {
        number = numberOf?.(id);
      } catch {
        number = undefined;
      }
      result.errors.push({ id, number, error: error instanceof Error ? error.message : "Action failed" });
    }
  }
  return result;
}
