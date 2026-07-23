import { PageTemplate, PageSection } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import {FP_READ_API_DOCUMENTATION} from "@/ui/auth/functional_permissions.ts";

export const meta: PageMeta = {
    id: "admin-api-documentation",
    urn: "urn:bun-starter:ui:page:admin-api-documentation",
    path: "/admin/api-documentation",
    title: "API documentation",
    description: "Interactive API documentation rendered by Scalar.",
    menu: {
        section: "Administration",
        order: 42,
        label: "API documentation",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_READ_API_DOCUMENTATION.functionalPermissionName],
};

export function Component() {
    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="OpenAPI / Scalar">
                <iframe
                    src="/api/docs"
                    title="API documentation"
                    style={{ width: "100%", minHeight: "70vh", border: "1px solid #e5e7eb", borderRadius: "10px" }}
                />
            </PageSection>
        </PageTemplate>
    );
}

