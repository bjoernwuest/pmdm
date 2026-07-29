import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";

export const meta: PageMeta = {
    id: "doc",
    urn: "urn:bun-starter:ui:page:doc",
    path: "/doc",
    title: "Documentation",
    description: "Central place for user guides and technical reference.",
    menu: {
        section: "General",
        order: 100,
        label: "Documentation",
    },
};

export function Component() {
    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Welcome">
                <p>This page is registered through page metadata and rendered in the shared shell layout.</p>
            </PageSection>
        </PageTemplate>
    );
}

