import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageTemplate, PageSection } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import {
    FP_MANAGE_CONFIGURATION,
    FP_READ_API_DOCUMENTATION,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_READ_GROUPS,
    FP_READ_USERS,
    FP_VIEW_API_KEYS,
} from "@/ui/auth/functional_permissions.ts";

export const meta: PageMeta = {
    id: "admin-home",
    urn: "urn:bun-starter:ui:page:admin-home",
    path: "/admin",
    title: "Administration",
    description: "Read-only administration views and permission assignment tools.",
    menu: {
        section: "Administration",
        order: 90,
        label: "Admin",
    },
};

type ViewerContext = { permissionNames: string[] };

const adminCards = [
    { to: "/admin/users", label: "Users", requiredFunctionalPermissions: [FP_READ_USERS.functionalPermissionName] },
    { to: "/admin/groups", label: "Groups", requiredFunctionalPermissions: [FP_READ_GROUPS.functionalPermissionName] },
    {
        to: "/admin/functional-permissions",
        label: "Functional permissions",
        requiredFunctionalPermissions: [FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName],
    },
    {
        to: "/admin/api-documentation",
        label: "API documentation",
        requiredFunctionalPermissions: [FP_READ_API_DOCUMENTATION.functionalPermissionName],
    },
    {
        to: "/admin/config",
        label: "Configuration",
        requiredFunctionalPermissions: [FP_MANAGE_CONFIGURATION.functionalPermissionName],
    },
    {
        to: "/admin/api-keys",
        label: "API keys",
        requiredFunctionalPermissions: [FP_VIEW_API_KEYS.functionalPermissionName],
    },
] as const;

export function Component() {
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });

    useEffect(() => {
        let cancelled = false;
        void apiGet<ViewerContext>("/api/me/context").then((payload) => {
            if (!cancelled) setViewerContext(payload);
        }).catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    const visibleCards = useMemo(() => {
        return adminCards.filter((card) => card.requiredFunctionalPermissions.every((permissionName) => viewerContext.permissionNames.includes(permissionName)));
    }, [viewerContext.permissionNames]);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Modules">
                <div className="admin-link-grid">
                    {visibleCards.map((card) => (
                        <Link key={card.to} className="admin-link-card" to={card.to}>{card.label}</Link>
                    ))}
                </div>
                {visibleCards.length === 0 ? <p className="small-muted">No administration modules are available for your account.</p> : null}
            </PageSection>
        </PageTemplate>
    );
}

