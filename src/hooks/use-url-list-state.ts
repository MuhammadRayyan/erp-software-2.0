"use client";

import { useCallback, useMemo } from "react";
import type { SortingState, Updater } from "@tanstack/react-table";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import {
  LIST_SORT_DIRS,
  resolveNextSortFromUpdater,
  sanitizePage,
  sanitizePageSize,
  toSortingState,
  type ListSortDir,
} from "@/lib/list-query-params";
import type { PaginationInfo } from "@/components/list-pagination";

const clientListParsers = {
  q: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
  from: parseAsString.withDefault(""),
  to: parseAsString.withDefault(""),
  customerId: parseAsString.withDefault(""),
  supplierId: parseAsString.withDefault(""),
  projectId: parseAsString.withDefault(""),
  accountId: parseAsString.withDefault(""),
  direction: parseAsString.withDefault(""),
  type: parseAsString.withDefault(""),
  category: parseAsString.withDefault(""),
  module: parseAsString.withDefault(""),
  sort: parseAsString.withDefault(""),
  dir: parseAsStringEnum<ListSortDir>([...LIST_SORT_DIRS]).withDefault("desc"),
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger,
};

export type ClientListFilterKey =
  | "q"
  | "status"
  | "from"
  | "to"
  | "customerId"
  | "supplierId"
  | "projectId"
  | "accountId"
  | "direction"
  | "type"
  | "category"
  | "module";

export function useUrlListState(options?: {
  defaultSort?: string;
  defaultDir?: ListSortDir;
  defaultPageSize?: number;
}) {
  const defaultSort = options?.defaultSort ?? "";
  const defaultDir = options?.defaultDir ?? "desc";
  const defaultPageSize = options?.defaultPageSize ?? 50;

  const [state, setState] = useQueryStates(clientListParsers, {
    shallow: true,
    history: "replace",
    scroll: false,
  });

  const activeSort = state.sort || defaultSort;
  const activeDir = state.sort ? state.dir : defaultDir;
  const sorting = useMemo<SortingState>(
    () => toSortingState(activeSort, activeDir),
    [activeSort, activeDir],
  );

  const pageSize = sanitizePageSize(state.pageSize ?? defaultPageSize, defaultPageSize);
  const page = sanitizePage(state.page);

  const setFilter = useCallback(
    (key: ClientListFilterKey, value: string) => {
      void setState({ [key]: value, page: 1 });
    },
    [setState],
  );

  const setFilters = useCallback(
    (patch: Partial<Record<ClientListFilterKey, string>>) => {
      void setState({ ...patch, page: 1 });
    },
    [setState],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      void setState({ page: Math.max(1, nextPage) });
    },
    [setState],
  );

  const setPageSize = useCallback(
    (nextPageSize: number) => {
      void setState({
        pageSize: sanitizePageSize(nextPageSize, defaultPageSize),
        page: 1,
      });
    },
    [setState, defaultPageSize],
  );

  const onSortingChange = useCallback(
    (updater: Updater<SortingState>) => {
      const next = resolveNextSortFromUpdater(updater, activeSort, activeDir, defaultDir);
      void setState({ sort: next.sort, dir: next.sort ? next.dir : null, page: 1 });
    },
    [setState, activeSort, activeDir, defaultDir],
  );

  const resetFilters = useCallback(() => {
    void setState({
      q: "",
      status: "",
      from: "",
      to: "",
      customerId: "",
      supplierId: "",
      projectId: "",
      accountId: "",
      direction: "",
      type: "",
      category: "",
      module: "",
      page: 1,
    });
  }, [setState]);

  const buildPagination = useCallback(
    (totalRows: number) => {
      const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
      const safePage = Math.min(page, totalPages);
      const pagination = { pageIndex: safePage - 1, pageSize };
      const paginationInfo: PaginationInfo = {
        page: safePage,
        pageSize,
        total: totalRows,
        totalPages,
      };
      return { pagination, paginationInfo };
    },
    [page, pageSize],
  );

  return {
    state,
    query: state.q,
    status: state.status,
    fromDate: state.from,
    toDate: state.to,
    customerId: state.customerId,
    supplierId: state.supplierId,
    projectId: state.projectId,
    accountId: state.accountId,
    direction: state.direction,
    type: state.type,
    category: state.category,
    moduleFilter: state.module,
    sorting,
    page,
    pageSize,
    setFilter,
    setFilters,
    setPage,
    setPageSize,
    onSortingChange,
    resetFilters,
    buildPagination,
  };
}
