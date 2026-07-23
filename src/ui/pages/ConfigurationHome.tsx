import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageSection, PageTemplate } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import {
    FP_DO_CONFIGURATION,
    FP_VIEW_CONSUMABLES,
    FP_VIEW_BUSINESS_DOMAINS,
    FP_VIEW_LOOKUPS,
    FP_VIEW_PRODUCT_TYPES,
    FP_VIEW_TARGET_SYSTEMS,
} from "@/ui/auth/app_functional_permissions.ts";

export const meta: PageMeta = {
    id: "configuration-home",
    urn: "urn:bun-starter:ui:page:configuration-home",
    path: "/configuration",
    title: "Configuration",
    description: "Configuration master data modules.",
    menu: {
        section: "Configuration",
        order: 10,
        label: "Configuration",
    },
    requiredFunctionalPermissions: [FP_DO_CONFIGURATION.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

const configCards = [
    {
        to: "/configuration/target-systems",
        label: "Target systems",
        requiredFunctionalPermissions: [FP_VIEW_TARGET_SYSTEMS.functionalPermissionName],
    },
    {
        to: "/configuration/product-types",
        label: "Product types",
        requiredFunctionalPermissions: [FP_VIEW_PRODUCT_TYPES.functionalPermissionName],
    },
    {
        to: "/configuration/business-domains",
        label: "Business domains",
        requiredFunctionalPermissions: [FP_VIEW_BUSINESS_DOMAINS.functionalPermissionName],
    },
    {
        to: "/configuration/consumables",
        label: "Consumables",
        requiredFunctionalPermissions: [FP_VIEW_CONSUMABLES.functionalPermissionName],
    },
    {
        to: "/configuration/lookups",
        label: "Lookups",
        requiredFunctionalPermissions: [FP_VIEW_LOOKUPS.functionalPermissionName],
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
        return configCards.filter((card) => card.requiredFunctionalPermissions.every((permissionName) => viewerContext.permissionNames.includes(permissionName)));
    }, [viewerContext.permissionNames]);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Modules">
                <div className="admin-link-grid">
                    {visibleCards.map((card) => (
                        <Link key={card.to} className="admin-link-card" to={card.to}>{card.label}</Link>
                    ))}
                </div>
                {visibleCards.length === 0 ? <p className="small-muted">No configuration modules are available for your account.</p> : null}
            </PageSection>
        </PageTemplate>
    );
}

