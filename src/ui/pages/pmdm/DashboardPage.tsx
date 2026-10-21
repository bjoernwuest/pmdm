import type { PageMeta } from "@/types/PageType.ts";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import { FP_VIEW_DASHBOARD } from "@/ui/auth/functional_permissions.ts";
import { getPendingProductRequestsByGroup } from "@/ui/api/Dashboard.ts";
import type { PendingRequestsByGroup } from "@/types/DashboardType.ts";
import {
    message_CreateProductRequest,
    message_UpdateProductRequestValue,
    message_ApproveProductRequestValue,
    message_CancelProductRequest,
    message_ImportingProductRequest,
    message_DoneProductRequest,
} from "@/types/ProductRequestType.ts";
import React, { useCallback, useEffect, useState } from "react";
import { Button } from "primereact/button";
import { Message } from "primereact/message";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";

export const meta: PageMeta = {
    id: "dashboard",
    urn: "urn:pmdm:ui:page:dashboard",
    path: "/dashboard",
    title: "Dashboard",
    description: "Overview of pending product request work by group.",
    menu: {
        section: "General",
        order: 0,
        label: "Dashboard",
    },
    requiredFunctionalPermissions: [FP_VIEW_DASHBOARD.functionalPermissionName],
};

const APPROVAL_COLOR = "#2563eb";
const ENTRY_COLOR = "#ea580c";
const GROUP_COLUMN_WIDTH = "220px";

function ChartRow({ group, maxCount }: { group: PendingRequestsByGroup; maxCount: number }) {
    const approvalWidth = `${(group.pendingApproval / maxCount) * 100}%`;
    const entryWidth = `${(group.pendingDataEntry / maxCount) * 100}%`;

    return (
        <div
            style={{ display: "flex", alignItems: "center", minHeight: "2rem", gap: "0.5rem" }}
            role="group"
            aria-label={`${group.groupName}: ${group.pendingApproval} pending approval, ${group.pendingDataEntry} pending data value entry, ${group.total} total`}
        >
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                <span style={{ minWidth: "2.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {group.pendingApproval}
                </span>
                <div style={{ flex: 1, height: "1.25rem", display: "flex", justifyContent: "flex-end" }}>
                    {group.pendingApproval > 0 && (
                        <div
                            title={`${group.pendingApproval} product request(s) pending approval`}
                            style={{
                                width: approvalWidth,
                                height: "100%",
                                background: APPROVAL_COLOR,
                                borderRadius: "0.25rem 0 0 0.25rem",
                            }}
                        />
                    )}
                </div>
            </div>

            <div style={{
                width: GROUP_COLUMN_WIDTH,
                flexShrink: 0,
                textAlign: "center",
                fontWeight: 600,
                overflowWrap: "anywhere",
                padding: "0 0.75rem",
            }}>
                {group.groupName}
            </div>

            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                <div style={{ flex: 1, height: "1.25rem" }}>
                    {group.pendingDataEntry > 0 && (
                        <div
                            title={`${group.pendingDataEntry} product request(s) pending data value entry`}
                            style={{
                                width: entryWidth,
                                height: "100%",
                                background: ENTRY_COLOR,
                                borderRadius: "0 0.25rem 0.25rem 0",
                            }}
                        />
                    )}
                </div>
                <span style={{ minWidth: "2.5rem", fontVariantNumeric: "tabular-nums" }}>
                    {group.pendingDataEntry}
                </span>
            </div>
        </div>
    );
}

export function Component() {
    const [groups, setGroups] = useState<PendingRequestsByGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getPendingProductRequestsByGroup();
            setGroups(response.groups);
        } catch (e: any) {
            setError(e?.message ?? "Failed to load dashboard data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                void load();
            }, 300);
        };

        const sub1 = subscribe({ and: message_CreateProductRequest }, scheduleRefresh);
        const sub2 = subscribe({ and: message_UpdateProductRequestValue }, scheduleRefresh);
        const sub3 = subscribe({ and: message_ApproveProductRequestValue }, scheduleRefresh);
        const sub4 = subscribe({ and: message_CancelProductRequest }, scheduleRefresh);
        const sub5 = subscribe({ and: message_ImportingProductRequest }, scheduleRefresh);
        const sub6 = subscribe({ and: message_DoneProductRequest }, scheduleRefresh);
        return () => {
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            if (sub1) unsubscribe(sub1);
            if (sub2) unsubscribe(sub2);
            if (sub3) unsubscribe(sub3);
            if (sub4) unsubscribe(sub4);
            if (sub5) unsubscribe(sub5);
            if (sub6) unsubscribe(sub6);
        };
    }, [load]);

    const maxCount = Math.max(1, ...groups.flatMap((group) => [group.pendingApproval, group.pendingDataEntry]));

    return (
        <PageTemplate
            urn={meta.urn}
            title={meta.title}
            description={meta.description}
            actions={(
                <Button
                    label="Refresh"
                    icon="pi pi-refresh"
                    className="p-button-outlined"
                    onClick={() => void load()}
                    loading={loading}
                />
            )}
        >
            <PageSection title="Pending requests by group">
                {error && <Message severity="error" text={error} />}
                {!error && loading && groups.length === 0 && <div>Loading…</div>}
                {!error && !loading && groups.length === 0 && (
                    <Message severity="info" text="No pending product requests by group." />
                )}
                {groups.length > 0 && (
                    <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem", fontSize: "0.85rem" }}>
                        <div style={{ flex: 1, textAlign: "right", color: APPROVAL_COLOR, fontWeight: 600 }}>
                            Pending approval
                        </div>
                        <div style={{ width: GROUP_COLUMN_WIDTH, flexShrink: 0 }} />
                        <div style={{ flex: 1, color: ENTRY_COLOR, fontWeight: 600 }}>
                            Pending data value entry
                        </div>
                    </div>
                )}
                {groups.map((group) => (
                    <ChartRow key={group.groupIdentifier} group={group} maxCount={maxCount} />
                ))}
            </PageSection>
        </PageTemplate>
    );
}
