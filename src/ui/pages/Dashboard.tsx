
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { getViewerContext } from "@/ui/api/session.ts";
import { useEffect, useState } from "react";

export const meta: PageMeta = {
    id: "dashboard",
    urn: "urn:bun-starter:ui:page:dashboard",
    path: "/dashboard",
    title: "Dashboard",
    description: "Start page of the application.",
    menu: {
        section: "General",
        order: 0,
        label: "Dashboard",
    },
};

export function Component() {
    const [displayName, setDisplayName] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void getViewerContext()
            .then((payload) => {
                if (!cancelled) setDisplayName(payload.user.displayName ?? payload.user.preferredUsername ?? null);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Welcome">
                <p>
                    {displayName ? `Welcome, ${displayName}.` : "Welcome."} Use the sidebar to navigate to the available sections.
                </p>
            </PageSection>
        </PageTemplate>
    );
}
