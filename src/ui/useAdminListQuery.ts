import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Shared admin list-query scaffolding: URL search-param parsing (1-based `page`,
 * `pageSize`, optional `showDisabled`, optional `search`) with integer validation and defaults,
 * the `updateQuery` writer, and the `availablePageSizes`/`total` state used by the
 * pager. Pages keep only their domain-specific fetch and rendering.
 */
export function useAdminListQuery(): {
    page: number;
    pageSize: number;
    showDisabled: boolean;
    search: string;
    availablePageSizes: number[];
    total: number;
    setAvailablePageSizes: (sizes: number[]) => void;
    setTotal: (total: number) => void;
    updateQuery: (patch: { page?: number; pageSize?: number; showDisabled?: boolean; search?: string }) => void;
} {
    const [searchParams, setSearchParams] = useSearchParams();
    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabled = searchParams.get("showDisabled") === "1";
    const search = searchParams.get("search") ?? "";
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);

    const updateQuery = useCallback((patch: { page?: number; pageSize?: number; showDisabled?: boolean; search?: string }) => {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (patch.page !== undefined) next.set("page", String(patch.page));
            if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));
            if (patch.showDisabled !== undefined) {
                if (patch.showDisabled) next.set("showDisabled", "1");
                else next.delete("showDisabled");
            }
            if (patch.search !== undefined) {
                if (patch.search) next.set("search", patch.search);
                else next.delete("search");
            }
            return next;
        });
    }, [setSearchParams]);

    return { page, pageSize, showDisabled, search, availablePageSizes, total, setAvailablePageSizes, setTotal, updateQuery };
}
