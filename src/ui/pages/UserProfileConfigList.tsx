import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "primereact/dialog";
import { ArrayEditorDialog, formatArraySummary, isArrayType, isInlineType, openArrayEditor, type ArrayEditorModalState } from "@/ui/components/ArrayEditor";
import Toggle from "@/ui/components/Toggle";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import type { UserProfileConfigEntry } from "@/ui/api/UserProfileConfig.ts";
import { getUserProfileConfigEntries, updateUserProfileConfigEntry } from "@/ui/api/UserProfileConfig.ts";
import { ApiError } from "@/ui/api/errors.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { TAG_UPDATE, TAG_USER_PROFILE_CONFIG } from "@/types/PubSubType";

type InlineEditState = {
    entry: UserProfileConfigEntry;
};

export const meta: PageMeta = {
    id: "user-profile-config",
    urn: "urn:bun-starter:ui:page:user-profile-config",
    path: "/profile",
    title: "User Profile",
    description: "Manage your personal configuration preferences.",
    menu: {
        section: "User",
        order: 100,
        label: "Profile",
        hidden: true,
    },
};

function effectiveValue(entry: UserProfileConfigEntry): unknown {
    return entry.userValue !== null && entry.userValue !== undefined ? entry.userValue : entry.value;
}

function toInlineDraftValue(entry: UserProfileConfigEntry): string | number | boolean {
    const val = effectiveValue(entry);

    if (entry.type === "number") {
        const num = typeof val === "number" ? val : Number(val);
        return Number.isFinite(num) ? num : 0;
    }

    if (entry.type === "boolean") {
        if (typeof val === "boolean") return val;
        return val === "true" || val === "1" || val === 1;
    }

    return typeof val === "string" ? val : String(val ?? "");
}

function formatScalarValue(entry: UserProfileConfigEntry): string {
    const val = effectiveValue(entry);
    if (entry.type === "boolean") return val === true ? "Enabled" : "Disabled";
    if (entry.type === "number") return typeof val === "number" ? String(val) : String(Number(val ?? 0));
    return String(val ?? "");
}

function isOverridden(entry: UserProfileConfigEntry): boolean {
    return entry.userValue !== null && entry.userValue !== undefined;
}

export function Component() {
    const [entries, setEntries] = useState<UserProfileConfigEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
    const [arrayModal, setArrayModal] = useState<ArrayEditorModalState | null>(null);
    const [arrayEditorEntry, setArrayEditorEntry] = useState<UserProfileConfigEntry | null>(null);
    const [savingKey, setSavingKey] = useState<string | null>(null);

    const inputEntryRef = useRef<InputFieldHandle | null>(null);

    const loadEntries = useCallback(async () => {
        const payload = await getUserProfileConfigEntries();
        setEntries(payload.entries);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        loadEntries()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load profile entries");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadEntries]);

    useEffect(() => {
        const token = subscribe(
            { and: [TAG_USER_PROFILE_CONFIG, TAG_UPDATE] },
            () => {
                void loadEntries().catch(() => undefined);
            }
        );
        return () => {
            if (token) unsubscribe(token);
        };
    }, [loadEntries]);

    const startArrayModal = (entry: UserProfileConfigEntry) => {
        if (!isArrayType(entry.type)) return;
        setArrayEditorEntry(entry);
        setArrayModal(openArrayEditor({ type: entry.type, inputFormat: entry.inputFormat, value: effectiveValue(entry), key: entry.key }));
        setInlineEdit(null);
        setError(null);
    };

    useEffect(() => {
        if (inlineEdit && inputEntryRef.current) {
            const entry = entries.find((e) => e.domain === inlineEdit.entry.domain && e.key === inlineEdit.entry.key);
            if (entry) {
                const strVal = String(toInlineDraftValue(entry));
                inputEntryRef.current.setOriginalValue(strVal, {
                    domain: entry.domain,
                    key: entry.key,
                    userValue: entry.userValue,
                });
                inputEntryRef.current.resetToOriginal();
            }
        }
    }, [inlineEdit, entries]);

    const handleToggle = async (entry: UserProfileConfigEntry, nextValue: boolean) => {
        const id = `${entry.domain}::${entry.key}`;
        setSavingKey(id);
        try {
            const updated = await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value: nextValue,
                knownUpdatedAt: entry.updatedAt ?? undefined,
            });
            setEntries((current) => current.map((e) => (e.domain === entry.domain && e.key === entry.key ? { ...e, userValue: updated.userValue, updatedAt: updated.updatedAt } : e)));
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError("Profile entry was modified in another tab. Reloading...");
                await loadEntries();
                return;
            }
            setError(err instanceof Error ? err.message : "Unable to save");
        } finally {
            setSavingKey(null);
        }
    };

    const handleReset = async (entry: UserProfileConfigEntry) => {
        const id = `${entry.domain}::${entry.key}`;
        setSavingKey(id);
        try {
            await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value: null,
                knownUpdatedAt: entry.updatedAt ?? undefined,
            });
            setEntries((current) => current.map((e) => (e.domain === entry.domain && e.key === entry.key ? { ...e, userValue: null, updatedAt: null } : e)));
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError("Profile entry was modified in another tab. Reloading...");
                await loadEntries();
                return;
            }
            setError(err instanceof Error ? err.message : "Unable to reset");
        } finally {
            setSavingKey(null);
        }
    };

    const handleInlineSave = async (entry: UserProfileConfigEntry, component: InputFieldHandle) => {
        if (!component.compareWithOriginal()) {
            setInlineEdit(null);
            return;
        }

        const rawValue = component.getCurrentValue();
        let value: unknown = rawValue;
        if (entry.type === "number") {
            // Strict validation: the raw string must be a complete valid number
            // (full-match), so partial input like "1abc" never persists as 1.
            const trimmed = rawValue.trim();
            if (trimmed.length === 0 || !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed) || !Number.isFinite(Number(trimmed))) {
                component.setHintText("Please enter a valid number");
                return;
            }
            value = Number(trimmed);
        }

        try {
            await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value,
                knownUpdatedAt: entry.updatedAt ?? undefined,
            });
            const payload = await getUserProfileConfigEntries();
            setEntries(payload.entries);
            setInlineEdit(null);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                component.setHintText("Modified in another tab. Please refresh.");
                return;
            }
            component.setHintText(err instanceof Error ? err.message : "Save failed");
        }
    };

    const saveArrayModal = async () => {
        if (!arrayModal || !arrayEditorEntry) return;
        setArrayModal((current) => current ? { ...current, isSaving: true } : current);
        try {
            const updated = await updateUserProfileConfigEntry(arrayEditorEntry.domain, arrayEditorEntry.key, {
                value: arrayModal.items,
                knownUpdatedAt: arrayEditorEntry.updatedAt ?? undefined,
            });
            setEntries((current) => current.map((e) => (e.domain === arrayEditorEntry.domain && e.key === arrayEditorEntry.key ? { ...e, userValue: updated.userValue, updatedAt: updated.updatedAt } : e)));
            setArrayModal(null);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError("Profile entry was modified in another tab. Reloading...");
                await loadEntries();
                setArrayModal(null);
                return;
            }
            setArrayModal((current) => current ? { ...current, isSaving: false } : current);
            setError(err instanceof Error ? err.message : "Unable to save profile value");
        }
    };

    const grouped = entries.reduce<Map<string, UserProfileConfigEntry[]>>((acc, entry) => {
        const domainEntries = acc.get(entry.domain);
        if (domainEntries) domainEntries.push(entry);
        else acc.set(entry.domain, [entry]);
        return acc;
    }, new Map());

    const groups = [...grouped.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([domain, domainEntries]) => ({
            domain,
            entries: domainEntries.sort((a, b) => a.key.localeCompare(b.key)),
        }));

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error ? <p className="admin-config-error">{error}</p> : null}
            {isLoading ? <p>Loading profile entries...</p> : null}
            {!isLoading && entries.length === 0 ? (
                <PageSection title="Profile">
                    <p>No user-configurable entries found.</p>
                </PageSection>
            ) : null}

            {!isLoading && groups.map((group) => (
                <PageSection key={group.domain} title={group.domain}>
                    <table className="mui-simple-table admin-table admin-config-table">
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th>Description</th>
                                <th>Global Default</th>
                                <th>Your Value</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {group.entries.map((entry) => {
                                const id = `${entry.domain}::${entry.key}`;
                                const isSaving = savingKey === id;
                                const isEditing = inlineEdit?.entry.domain === entry.domain && inlineEdit?.entry.key === entry.key;

                                let defaultValueDisplay: React.ReactNode = "-";
                                if (entry.type === "boolean") {
                                    defaultValueDisplay = entry.value === true ? "Enabled" : "Disabled";
                                } else if (entry.type === "number") {
                                    defaultValueDisplay = typeof entry.value === "number" ? String(entry.value) : String(Number(entry.value ?? 0));
                                } else if (entry.type === "string") {
                                    defaultValueDisplay = String(entry.value ?? "");
                                } else if (entry.type === "string[]" || entry.type === "number[]") {
                                    defaultValueDisplay = <code>{formatArraySummary({ type: entry.type, value: entry.value })}</code>;
                                } else {
                                    defaultValueDisplay = <code>{JSON.stringify(entry.value ?? null)}</code>;
                                }

                                return (
                                    <tr key={id}>
                                        <td><code>{entry.key}</code></td>
                                        <td>{entry.description ?? "-"}</td>
                                        <td className="admin-config-user-default-value">{defaultValueDisplay}</td>
                                        <td>
                                            {isInlineType(entry.type) ? (
                                                isEditing ? (
                                                    <InputField
                                                        ref={inputEntryRef}
                                                        showButtons={true}
                                                        onSave={(component, _source) => {
                                                            void handleInlineSave(entry, component);
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                        {entry.type === "boolean" ? (
                                                            <Toggle
                                                                variant="toggle"
                                                                value={Boolean(toInlineDraftValue(entry))}
                                                                options={[{ value: true, label: "Enabled" }, { value: false, label: "Disabled" }]}
                                                                onChange={async (t) => {
                                                                    await handleToggle(entry, t.getValue());
                                                                }}
                                                            />
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                className="admin-config-value-button"
                                                                onClick={() => setInlineEdit({ entry })}
                                                            >
                                                                {formatScalarValue(entry)}
                                                            </button>
                                                        )}
                                                    </div>
                                                )
                                            ) : isArrayType(entry.type) ? (
                                                <button
                                                    type="button"
                                                    className="admin-config-value-button"
                                                    onClick={() => startArrayModal(entry)}
                                                >
                                                    {formatArraySummary({ type: entry.type, value: effectiveValue(entry) })}
                                                </button>
                                            ) : (
                                                <code>{JSON.stringify(entry.userValue ?? entry.value)}</code>
                                            )}
                                        </td>
                                        <td>
                                            {isOverridden(entry) ? (
                                                <button
                                                    type="button"
                                                    className="admin-config-value-button"
                                                    disabled={isSaving}
                                                    onClick={() => {
                                                        void handleReset(entry);
                                                    }}
                                                >
                                                    Reset to default
                                                </button>
                                            ) : null}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </PageSection>
            ))}

            {arrayModal ? (
                <ArrayEditorDialog
                    state={arrayModal}
                    onChange={(updater) => setArrayModal((current) => current ? updater(current) : null)}
                    onClose={() => setArrayModal(null)}
                    onSave={() => void saveArrayModal()}
                />
            ) : null}
        </PageTemplate>
    );
}
