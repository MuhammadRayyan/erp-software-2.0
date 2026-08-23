import { addMinor } from "../calculations/money";

export type ProjectAmount = { accountId: string; projectId: string | null; amountMinor: number };

export function addProjectAmount(
  group: Map<string, ProjectAmount>,
  accountId: string,
  projectId: string | null,
  amount: number,
) {
  const key = `${accountId}\u0000${projectId ?? ""}`;
  const current = group.get(key);
  group.set(key, {
    accountId,
    projectId,
    amountMinor: addMinor([current?.amountMinor ?? 0, amount]),
  });
}

export function addAmount(group: Map<string, number>, accountId: string, amount: number) {
  group.set(accountId, addMinor([group.get(accountId) ?? 0, amount]));
}
