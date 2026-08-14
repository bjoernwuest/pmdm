import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { getFunctionalPermissions } from "@/ui/api/FunctionalPermissions.ts";
import { useAdminListQuery } from "@/ui/useAdminListQuery.ts";
import { AdminPager } from "@/ui/AdminPager.tsx";
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
    const [permissions, setPermissions] = useState<FunctionalPermissionsResponse["functionalPermissions"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const {
        page,
        pageSize,
        availablePageSizes,
        total,
        setAvailablePageSizes,
        setTotal,
        updateQuery,
    } = useAdminListQuery();

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const setLoading = page === 1 && permissions.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const payload = await getFunctionalPermissions(page - 1, pageSize);
                if (!cancelled) {
                    setPermissions(payload.functionalPermissions);
                    if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
                    setTotal(payload.total);
                    setAvailablePageSizes(payload.availablePageSizes);
                    if (!payload.availablePageSizes.includes(pageSize) && payload.availablePageSizes.length > 0) {
                        const [firstPageSize] = payload.availablePageSizes;
                        if (typeof firstPageSize === "number") {
                            updateQuery({ page: 1, pageSize: firstPageSize });
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Could not load functional permissions");
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
    }, [page, pageSize]);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Functional permission list">
                {error ? <p className="admin-config-error">{error}</p> : null}
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
                                {permissions.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                                            No functional permissions found.
                                        </td>
                                    </tr>
                                ) : (permissions.map((permission) => (
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
                                )))}
                            </tbody>
                        </table>
                        <AdminPager
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            availablePageSizes={availablePageSizes}
                            onUpdate={updateQuery}
                            entityLabel="functional permissions"
                        />
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
