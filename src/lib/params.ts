export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parsePageParam(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : undefined;
}

export function parsePageSizeParam(value: string | undefined, defaultSize: number = 25): number {
  if (!value) return defaultSize;
  const parsed = Number(value);
  return [25, 50, 100, 200].includes(parsed) ? parsed : defaultSize;
}

export function buildDateSearchParams({
  from,
  to,
  pageSize,
}: {
  from?: string;
  to?: string;
  pageSize?: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (pageSize !== undefined) params.set("pageSize", String(pageSize));
  return params;
}
