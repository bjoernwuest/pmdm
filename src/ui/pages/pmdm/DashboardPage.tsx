import type { PageMeta } from "@/types/PageType.ts";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import {
    FP_NOTIFY_INDIVIDUAL_OPEN_REQUEST,
    FP_VIEW_DASHBOARD,
} from "@/ui/auth/functional_permissions.ts";
import {
    getOpenProductRequestOptions,
    getOpenRequestGapAnalysis,
    getPendingProductRequestsByGroup,
    notifyOpenRequest,
} from "@/ui/api/Dashboard.ts";
import { getViewerContext } from "@/ui/api/session.ts";
import { ApiError } from "@/ui/api/errors.ts";
import type {
    DashboardGapField,
    OpenProductRequestGapAnalysis,
    OpenProductRequestOption,
    PendingRequestsByGroup,
} from "@/types/DashboardType.ts";
import {
    message_CreateProductRequest,
    message_UpdateProductRequestValue,
    message_ApproveProductRequestValue,
    message_CancelProductRequest,
    message_ImportingProductRequest,
    message_DoneProductRequest,
} from "@/types/ProductRequestType.ts";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "primereact/button";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Dialog } from "primereact/dialog";
import { Dropdown } from "primereact/dropdown";
import { InputSwitch } from "primereact/inputswitch";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { Toast } from "primereact/toast";
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

function groupsLabel(groups: { name: string }[]): string {
    return groups.length > 0 ? groups.map((group) => group.name).join(", ") : "—";
}

function approvalLabel(field: DashboardGapField): string {
    switch (field.approvalState) {
        case "blocked":
            return field.approvalBlockedBy.length > 0
                ? `Waiting for: ${field.approvalBlockedBy.join(", ")}`
                : "Waiting for other approvals";
        case "waiting_for_value":
            return "Waiting for value";
        case "pending":
            return "Pending";
        default:
            return "Approved";
    }
}

type ToastSeverity = "success" | "info" | "warn" | "error";

export function Component() {
    const [groups, setGroups] = useState<PendingRequestsByGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [permissionNames, setPermissionNames] = useState<string[]>([]);
    const [options, setOptions] = useState<OpenProductRequestOption[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<OpenProductRequestGapAnalysis | null>(null);
    const [analysisLoading, setAnalysisLoading] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [mandatoryOnly, setMandatoryOnly] = useState(false);
    const [infoMessage, setInfoMessage] = useState<string | null>(null);
    const [notifyLoading, setNotifyLoading] = useState(false);
    const [showNotifyConfirm, setShowNotifyConfirm] = useState(false);

    const toast = useRef<Toast>(null);
    const selectedIdRef = useRef<string | null>(null);
    selectedIdRef.current = selectedId;

    const canNotify = permissionNames.includes(FP_NOTIFY_INDIVIDUAL_OPEN_REQUEST.functionalPermissionName);

    const showToast = useCallback((severity: ToastSeverity, detail: string) => {
        toast.current?.show({
            severity,
            summary: severity === "error" ? "Notification failed" : "Notification",
            detail,
            life: 5000,
        });
    }, []);

    const loadGroups = useCallback(async () => {
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

    const loadOptions = useCallback(async (): Promise<OpenProductRequestOption[]> => {
        const response = await getOpenProductRequestOptions();
        setOptions(response.requests);
        return response.requests;
    }, []);

    const loadAnalysis = useCallback(async (identifier: string) => {
        setAnalysisLoading(true);
        setAnalysisError(null);
        try {
            const result = await getOpenRequestGapAnalysis(identifier);
            setAnalysis(result);
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
                setAnalysis(null);
                setSelectedId(null);
                setInfoMessage("The selected product request is no longer open.");
            } else {
                setAnalysisError(e instanceof Error ? e.message : "Failed to load the gap analysis.");
            }
        } finally {
            setAnalysisLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadGroups();
    }, [loadGroups]);

    useEffect(() => {
        void getViewerContext()
            .then((context) => setPermissionNames(Array.isArray(context.permissionNames) ? context.permissionNames : []))
            .catch(() => setPermissionNames([]));
    }, []);

    useEffect(() => {
        setOptionsLoading(true);
        void getOpenProductRequestOptions()
            .then((response) => setOptions(response.requests))
            .catch((e: any) => setAnalysisError(e?.message ?? "Failed to load open product requests."))
            .finally(() => setOptionsLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedId) {
            setAnalysis(null);
            return;
        }
        setInfoMessage(null);
        void loadAnalysis(selectedId);
    }, [selectedId, loadAnalysis]);

    const refresh = useCallback(async () => {
        await loadGroups();
        try {
            const list = await loadOptions();
            const current = selectedIdRef.current;
            if (!current) return;
            if (!list.some((request) => request.identifier === current)) {
                setSelectedId(null);
                setAnalysis(null);
                setInfoMessage("The selected product request is no longer open.");
                return;
            }
            await loadAnalysis(current);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to refresh dashboard data.");
        }
    }, [loadGroups, loadOptions, loadAnalysis]);

    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleRefresh = () => {
            if (debounceTimer !== null) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                debounceTimer = null;
                void refresh();
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
    }, [refresh]);

    const maxCount = Math.max(1, ...groups.flatMap((group) => [group.pendingApproval, group.pendingDataEntry]));
    const selectedRequest = options.find((request) => request.identifier === selectedId) ?? null;
    const visibleFields = (analysis?.fields ?? []).filter((field) => !mandatoryOnly || field.mandatory);

    const handleNotify = async () => {
        if (!selectedId) return;
        setShowNotifyConfirm(false);
        setNotifyLoading(true);
        try {
            const result = await notifyOpenRequest(selectedId);
            if (result.sentTo > 0) {
                showToast("success", `Email sent to ${result.sentTo} recipient(s)`);
            } else if (result.skippedReason === "notifications_disabled") {
                showToast("warn", "Notifications are disabled. Enable them in the notification configuration.");
            } else if (result.skippedReason === "missing_sender") {
                showToast("warn", "The sender address (From) is missing in the notification configuration.");
            } else {
                showToast("info", "No actionable recipients for this request.");
            }
        } catch (e) {
            if (e instanceof ApiError && e.status === 404) {
                setSelectedId(null);
                setAnalysis(null);
                setInfoMessage("The selected product request is no longer open.");
                showToast("error", "The selected product request is no longer open.");
            } else {
                showToast("error", e instanceof Error ? e.message : "Failed to send the notification.");
            }
        } finally {
            setNotifyLoading(false);
        }
    };

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
                    onClick={() => void refresh()}
                    loading={loading}
                />
            )}
        >
            <Toast ref={toast} />

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

            <PageSection title="Open request gaps">
                {infoMessage && <Message severity="info" text={infoMessage} />}
                {analysisError && <Message severity="error" text={analysisError} />}

                {optionsLoading ? (
                    <div>Loading…</div>
                ) : options.length === 0 ? (
                    analysisError ? null : <Message severity="info" text="No open product requests." />
                ) : (
                    <>
                        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                            <Dropdown
                                value={selectedId}
                                options={options.map((request) => ({
                                    label: `${request.productNumber} — ${request.productTypeName}`,
                                    value: request.identifier,
                                }))}
                                onChange={(event) => setSelectedId(event.value)}
                                placeholder="Select an open product request"
                                filter
                                style={{ minWidth: "20rem" }}
                            />
                            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <InputSwitch
                                    inputId="mandatory-only"
                                    checked={mandatoryOnly}
                                    onChange={(event) => setMandatoryOnly(!!event.value)}
                                />
                                <label htmlFor="mandatory-only">Mandatory fields only</label>
                            </div>
                        </div>

                        {!selectedId && <Message severity="info" text="Select a product request to inspect its gaps." />}

                        {selectedId && (
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "0.75rem",
                                flexWrap: "wrap",
                                marginBottom: "0.5rem",
                            }}>
                                <div style={{ fontSize: "0.9rem" }}>
                                    {selectedRequest && (
                                        <>
                                            <div><strong>{selectedRequest.productNumber}</strong> — {selectedRequest.productTypeName}</div>
                                            <div>Creator: {analysis?.createdByName || selectedRequest.createdByName || "—"}</div>
                                        </>
                                    )}
                                </div>
                                {canNotify && (
                                    <Button
                                        label="Trigger people"
                                        icon="pi pi-send"
                                        className="p-button-outlined"
                                        onClick={() => setShowNotifyConfirm(true)}
                                        loading={notifyLoading}
                                        disabled={notifyLoading}
                                    />
                                )}
                            </div>
                        )}

                        {selectedId && analysisLoading && <div>Loading…</div>}

                        {selectedId && !analysisLoading && analysis && analysis.fields.length === 0 && (
                            <Message severity="info" text="No gaps for this request." />
                        )}
                        {selectedId && !analysisLoading && analysis && analysis.fields.length > 0 && visibleFields.length === 0 && (
                            <Message severity="info" text="No mandatory gaps for this request." />
                        )}

                        {selectedId && !analysisLoading && visibleFields.length > 0 && (
                            <DataTable value={visibleFields} dataKey="dataTypeIdentifier" size="small" stripedRows>
                                <Column
                                    header="Field"
                                    body={(field: DashboardGapField) => (
                                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                            <span>{field.dataTypeName}</span>
                                            <Tag value={field.dataTypeKind} />
                                        </div>
                                    )}
                                />
                                <Column
                                    header="Mandatory"
                                    body={(field: DashboardGapField) => (field.mandatory ? "Yes" : "No")}
                                />
                                <Column
                                    header="Value"
                                    body={(field: DashboardGapField) => (
                                        <Tag
                                            severity={field.valueMissing ? "warning" : "success"}
                                            value={field.valueMissing ? "Missing" : "Provided"}
                                        />
                                    )}
                                />
                                <Column header="Approval" body={(field: DashboardGapField) => approvalLabel(field)} />
                                <Column header="Can provide" body={(field: DashboardGapField) => groupsLabel(field.providerGroups)} />
                                <Column header="Can approve" body={(field: DashboardGapField) => groupsLabel(field.approverGroups)} />
                            </DataTable>
                        )}
                    </>
                )}
            </PageSection>

            <Dialog
                header="Trigger people"
                visible={showNotifyConfirm}
                modal
                style={{ width: "32rem" }}
                onHide={() => setShowNotifyConfirm(false)}
                footer={(
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                        <Button
                            label="Cancel"
                            className="p-button-text"
                            onClick={() => setShowNotifyConfirm(false)}
                            disabled={notifyLoading}
                        />
                        <Button
                            label="Send"
                            icon="pi pi-send"
                            onClick={() => void handleNotify()}
                            loading={notifyLoading}
                        />
                    </div>
                )}
            >
                <p>
                    Send a notification email to all people with pending work on{" "}
                    <strong>{selectedRequest?.productNumber ?? "the selected request"}</strong>?
                </p>
                <p>Users who already completed their part of this request will not receive an email.</p>
            </Dialog>
        </PageTemplate>
    );
}
