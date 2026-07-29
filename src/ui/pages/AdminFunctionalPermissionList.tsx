import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import { FP_READ_FUNCTIONAL_PERMISSIONS } from "@/ui/auth/functional_permissions.ts";
import type { FunctionalPermissionsResponse } from "@/types/ApiType.ts";

export const meta: PageMeta = {
    id: "admin-functional-permissions",
    urn: "urn:bun-starter:ui:page:admin-functional-permissions",
    path: "/admin/functional-permissions",
    title: "Functional permissions",
    description: "Read-only functional permission list and details.",
    menu: {
        section: "Administration",
        order: 30,
        label: "Functional permissions",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName],
};

function formatTs(value: Date | string): string {
    return new Date(value as string).toLocaleString();
}

export function Component() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [permissions, setPermissions] = useState<FunctionalPermissionsResponse["functionalPermissions"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);

    const updateQuery = (patch: { page?: number; pageSize?: number }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.page !== undefined) next.set("page", String(patch.page));
        if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));
        setSearchParams(next);
    };

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const setLoading = page === 1 && permissions.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const payload = await apiGet<FunctionalPermissionsResponse>(`/api/functionalpermissions?page=${page - 1}&pageSize=${pageSize}`);
                if (!cancelled) {
                    setPermissions(payload.functionalPermissions);
                    if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
                    setTotal(payload.total);
                    setAvailablePageSizes(payload.availablePageSizes);
                    if (!payload.availablePageSizes.includes(pageSize) && payload.availablePageSizes.length > 0) {
                        updateQuery({ page: 1, pageSize: payload.availablePageSizes[0]! });
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                    setIsPageLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [page, pageSize, searchParams.toString()]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Functional permission list">
                {isLoading || isPageLoading ? (
                    <p>Loading functional permissions...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Group</th>
                                    <th>Description</th>
                                    <th>Technical identifier</th>
                                    <th>Created</th>
                                    <th>Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {permissions.map((permission) => (
                                    <tr
                                        key={permission.identifier}
                                        className="admin-clickable-row"
                                        onClick={() => navigate(`/admin/functional-permissions/${encodeURIComponent(permission.identifier)}${location.search}`)}
                                        onKeyDown={(event) => {
                                            if (event.key === "Enter" || event.key === " ") {
                                                event.preventDefault();
                                                navigate(`/admin/functional-permissions/${encodeURIComponent(permission.identifier)}${location.search}`);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <td>{permission.functionalPermissionName}</td>
                                        <td>{permission.group}</td>
                                        <td>{permission.description}</td>
                                        <td><code>{permission.identifier}</code></td>
                                        <td>{formatTs(permission.createdAt)}</td>
                                        <td>{formatTs(permission.updatedAt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="admin-pager-row">
                            <button type="button" disabled={page <= 1} onClick={() => updateQuery({ page: Math.max(1, page - 1) })}>
                                Previous
                            </button>
                            <span>Page {page} of {totalPages}</span>
                            <button type="button" disabled={page >= totalPages} onClick={() => updateQuery({ page: Math.min(totalPages, page + 1) })}>
                                Next
                            </button>
                            <label>
                                Page size
                                <select
                                    className="admin-page-size"
                                    value={pageSize}
                                    onChange={(event) => {
                                        updateQuery({ page: 1, pageSize: Number(event.target.value) });
                                    }}
                                >
                                    {availablePageSizes.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </label>
                            <span>{total} functional permissions</span>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
