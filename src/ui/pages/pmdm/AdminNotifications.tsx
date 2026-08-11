import { useCallback, useEffect, useRef, useState } from "react";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import {
    getNotificationConfig,
    updateNotificationConfig,
    sendNotifications,
    simulateNotification,
    fetchUsers,
    fetchGroups,
    type NotificationConfigEntry,
    type SimulateResult,
} from "@/ui/api/Notifications.ts";
import { ApiError } from "@/ui/api/errors.ts";
import { FP_NOTIFICATIONS } from "@/ui/auth/functional_permissions.ts";
import Toggle from "@/ui/components/Toggle.tsx";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField.tsx";
import { Dialog } from "primereact/dialog";
import { MultiSelect } from "primereact/multiselect";
import { Dropdown } from "primereact/dropdown";

export const meta: PageMeta = {
    id: "admin-notifications",
    urn: "urn:bun-starter:ui:page:admin-notifications",
    path: "/admin/notifications",
    title: "Notifications",
    description: "Configure email notifications for product request workflows.",
    menu: {
        section: "Administration",
        order: 55,
        label: "Notifications",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_NOTIFICATIONS.functionalPermissionName],
};

function isBooleanEntry(entry: NotificationConfigEntry): boolean {
    return entry.type === "boolean";
}

function formatValue(entry: NotificationConfigEntry): string {
    const val = entry.value;
    if (entry.type === "boolean") return val === true ? "Enabled" : "Inactive";
    if (val === null || val === undefined) return "(empty)";
    return String(val);
}

function ConfigRow({ entry, onUpdate }: { entry: NotificationConfigEntry; onUpdate: (entry: NotificationConfigEntry) => void }) {
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const inputRef = useRef<InputFieldHandle>(null);

    useEffect(() => {
        if (editing && inputRef.current) {
            inputRef.current.setOriginalValue(String(entry.value ?? ""));
            inputRef.current.resetToOriginal();
        }
    }, [editing, entry.value]);

    const handleToggle = async (toggle: { getValue: () => boolean }) => {
        setSaving(true);
        try {
            const updated = await updateNotificationConfig(entry.key, toggle.getValue(), entry.value);
            onUpdate(updated);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                const fresh = await getNotificationConfig();
                const match = fresh.find((e) => e.key === entry.key);
                if (match) onUpdate(match);
            }
        } finally {
            setSaving(false);
        }
    };

    const handleInlineSave = async (component: InputFieldHandle) => {
        const raw = component.getCurrentValue();
        let value: unknown = raw;
        if (entry.type === "number") {
            const n = parseFloat(raw);
            if (isNaN(n)) { component.setHintText("Enter a valid number"); return; }
            value = n;
        }
        setSaving(true);
        try {
            const updated = await updateNotificationConfig(entry.key, value, entry.value);
            onUpdate(updated);
            setEditing(false);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                component.setHintText("Modified in another tab. Reloading...");
                const fresh = await getNotificationConfig();
                const match = fresh.find((e) => e.key === entry.key);
                if (match) onUpdate(match);
                setEditing(false);
                return;
            }
            component.setHintText(err instanceof Error ? err.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <tr>
            <td><code>{entry.key}</code></td>
            <td>{entry.description ?? "-"}</td>
            <td>
                {isBooleanEntry(entry) ? (
                    <Toggle
                        variant="toggle"
                        value={entry.value === true}
                        options={[{ value: true, label: "Enabled" }, { value: false, label: "Inactive" }]}
                        onChange={(t) => { void handleToggle(t); }}
                    />
                ) : editing ? (
                    <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                        <InputField
                            ref={inputRef}
                            showButtons
                            onSave={(component) => { void handleInlineSave(component); }}
                        />
                        <button type="button" onClick={() => setEditing(false)}>Cancel</button>
                    </div>
                ) : (
                    <button type="button" className="admin-config-value-button" onClick={() => setEditing(true)} disabled={saving}>
                        {formatValue(entry)}
                    </button>
                )}
            </td>
            <td>{entry.userProfile ? "Yes" : "No"}</td>
        </tr>
    );
}

export function Component() {
    const [entries, setEntries] = useState<NotificationConfigEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [allUsers, setAllUsers] = useState<{ identifier: string; firstName: string; lastName: string; email: string | null }[]>([]);
    const [allGroups, setAllGroups] = useState<{ identifier: string; groupName: string }[]>([]);

    const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<string | null>(null);

    const [simMode, setSimMode] = useState<"user" | "group">("user");
    const [simUserId, setSimUserId] = useState<string | null>(null);
    const [simGroupId, setSimGroupId] = useState<string | null>(null);
    const [simulating, setSimulating] = useState(false);
    const [simResult, setSimResult] = useState<SimulateResult | null>(null);
    const [simError, setSimError] = useState<string | null>(null);

    const loadConfig = useCallback(async () => {
        const data = await getNotificationConfig();
        setEntries(data.sort((a, b) => a.key.localeCompare(b.key)));
    }, []);

    useEffect(() => {
        void loadConfig().finally(() => setLoading(false));
        void fetchUsers().then(setAllUsers).catch(() => undefined);
        void fetchGroups().then(setAllGroups).catch(() => undefined);
    }, [loadConfig]);

    const handleConfigUpdate = (updated: NotificationConfigEntry) => {
        setEntries((prev) => prev.map((e) => (e.key === updated.key ? updated : e)));
    };

    const handleSend = async () => {
        setSending(true);
        setSendResult(null);
        try {
            const result = await sendNotifications(
                selectedUserIds.length > 0 ? selectedUserIds : undefined,
                selectedGroupIds.length > 0 ? selectedGroupIds : undefined,
            );
            setSendResult(`Email sent to ${result.sentTo} recipient(s).`);
        } catch (err) {
            setSendResult(err instanceof Error ? err.message : "Send failed");
        } finally {
            setSending(false);
        }
    };

    const handleSendAll = async () => {
        setSending(true);
        setSendResult(null);
        try {
            const result = await sendNotifications();
            setSendResult(`Email sent to ${result.sentTo} recipient(s).`);
        } catch (err) {
            setSendResult(err instanceof Error ? err.message : "Send failed");
        } finally {
            setSending(false);
        }
    };

    const handleSimulate = async () => {
        setSimulating(true);
        setSimResult(null);
        setSimError(null);
        try {
            const result = await simulateNotification(
                simMode === "user" ? (simUserId ?? undefined) : undefined,
                simMode === "group" ? (simGroupId ?? undefined) : undefined,
            );
            if ("error" in result) {
                setSimError(result.error);
            } else {
                setSimResult(result);
            }
        } catch (err) {
            setSimError(err instanceof Error ? err.message : "Simulation failed");
        } finally {
            setSimulating(false);
        }
    };

    const userOptions = allUsers.map((u) => ({
        label: `${u.firstName} ${u.lastName}${u.email ? ` (${u.email})` : ""}`,
        value: u.identifier,
    }));

    const groupOptions = allGroups.map((g) => ({
        label: g.groupName,
        value: g.identifier,
    }));

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error ? <p className="admin-config-error">{error}</p> : null}

            <PageSection title="Configuration">
                {loading ? (
                    <p>Loading...</p>
                ) : (
                    <table className="mui-simple-table admin-table admin-config-table">
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>Description</th>
                                <th>Value</th>
                                <th>User Profile</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((entry) => (
                                <ConfigRow key={`${entry.domain}::${entry.key}`} entry={entry} onUpdate={handleConfigUpdate} />
                            ))}
                        </tbody>
                    </table>
                )}
            </PageSection>

            <PageSection title="Manual Send (Out-of-Sequence Delivery)">
                <div className="admin-notifications-send-section">
                    <div className="admin-notifications-select-row">
                        <div className="admin-notifications-select">
                            <label>Users</label>
                            <MultiSelect
                                value={selectedUserIds}
                                options={userOptions}
                                onChange={(e) => setSelectedUserIds(e.value as string[])}
                                placeholder="Select users..."
                                display="chip"
                                filter
                                style={{ minWidth: "300px" }}
                            />
                        </div>
                        <div className="admin-notifications-select">
                            <label>Groups</label>
                            <MultiSelect
                                value={selectedGroupIds}
                                options={groupOptions}
                                onChange={(e) => setSelectedGroupIds(e.value as string[])}
                                placeholder="Select groups..."
                                display="chip"
                                filter
                                style={{ minWidth: "300px" }}
                            />
                        </div>
                    </div>
                    <div className="admin-config-actions">
                        <button type="button" onClick={handleSend} disabled={sending}>
                            {sending ? "Sending..." : "Send to selected"}
                        </button>
                        <button type="button" onClick={handleSendAll} disabled={sending}>
                            {sending ? "Sending..." : "Send to all"}
                        </button>
                    </div>
                    {sendResult ? <p className="admin-notifications-result">{sendResult}</p> : null}
                </div>
            </PageSection>

            <PageSection title="Simulate">
                <div className="admin-notifications-simulate-section">
                    <div className="admin-config-actions">
                        <label>
                            <input type="radio" checked={simMode === "user"} onChange={() => setSimMode("user")} />
                            {" "}User
                        </label>
                        <label>
                            <input type="radio" checked={simMode === "group"} onChange={() => setSimMode("group")} />
                            {" "}Group
                        </label>
                    </div>
                    <div className="admin-notifications-select" style={{ marginTop: "8px" }}>
                        {simMode === "user" ? (
                            <Dropdown
                                value={simUserId}
                                options={userOptions}
                                onChange={(e) => setSimUserId(e.value as string)}
                                placeholder="Select a user..."
                                filter
                                style={{ minWidth: "300px" }}
                            />
                        ) : (
                            <Dropdown
                                value={simGroupId}
                                options={groupOptions}
                                onChange={(e) => setSimGroupId(e.value as string)}
                                placeholder="Select a group..."
                                filter
                                style={{ minWidth: "300px" }}
                            />
                        )}
                    </div>
                    <div className="admin-config-actions" style={{ marginTop: "8px" }}>
                        <button type="button" onClick={handleSimulate} disabled={simulating}>
                            {simulating ? "Simulating..." : "Simulate"}
                        </button>
                    </div>
                    {simError ? <p className="admin-config-error">{simError}</p> : null}
                    {simResult ? (
                        <div className="admin-notifications-sim-result">
                            <p><strong>Subject:</strong> {simResult.subject}</p>
                            <p><strong>Simulated for:</strong> {simResult.simulatedFor.name} ({simResult.simulatedFor.type})</p>
                            <div
                                className="admin-notifications-email-preview"
                                dangerouslySetInnerHTML={{ __html: simResult.html }}
                            />
                        </div>
                    ) : null}
                </div>
            </PageSection>
        </PageTemplate>
    );
}
