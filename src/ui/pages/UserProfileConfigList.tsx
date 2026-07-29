import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";
import Toggle from "@/ui/components/Toggle";
import InputField, { type InputFieldHandle } from "@/ui/components/InputField";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import type { UserProfileConfigEntry } from "@/ui/api/UserProfileConfig.ts";
import { getUserProfileConfigEntries, updateUserProfileConfigEntry } from "@/ui/api/UserProfileConfig.ts";
import { ApiError } from "@/ui/api/errors.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { TAG_UPDATE, TAG_USER_PROFILE_CONFIG } from "@/types/PubSubType";

type InlineType = "string" | "number" | "boolean";
type ArrayType = "string[]" | "number[]";

type InlineEditState = {
    entry: UserProfileConfigEntry;
};

type ArrayModalState = {
    entry: UserProfileConfigEntry;
    items: Array<string | number>;
    originalItems: Array<string | number>;
    draftInput: string;
    inputValidation: { ok: true } | { ok: false; error: string };
    editingIndex: number | null;
    editDraft: string;
    editValidation: { ok: true } | { ok: false; error: string };
    isSaving: boolean;
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

function isInlineType(type: string): type is InlineType {
    return type === "string" || type === "number" || type === "boolean";
}

function isArrayType(type: string): type is ArrayType {
    return type === "string[]" || type === "number[]";
}

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

function formatArraySummary(entry: UserProfileConfigEntry): string {
    const val = effectiveValue(entry);
    if (!Array.isArray(val)) return "[]";
    return JSON.stringify(val);
}

function isOverridden(entry: UserProfileConfigEntry): boolean {
    return entry.userValue !== null && entry.userValue !== undefined;
}

function normalizeArrayValues(entry: UserProfileConfigEntry): Array<string | number> {
    const val = effectiveValue(entry);
    if (!Array.isArray(val)) return [];
    if (entry.type === "number[]") {
        return val
            .map((item) => (typeof item === "number" ? item : Number(item)))
            .filter((item) => Number.isFinite(item));
    }
    return val.map((item) => String(item));
}

function validateArrayItem(entry: UserProfileConfigEntry, raw: string): { ok: true; parsedValue: string | number } | { ok: false; error: string } {
    if (!isArrayType(entry.type)) return { ok: false, error: "Unsupported array type" };
    const trimmed = raw.trim();
    if (trimmed.length === 0) return { ok: false, error: "Value cannot be empty" };

    if (entry.inputFormat && entry.inputFormat.trim().length > 0) {
        try {
            const regex = new RegExp(entry.inputFormat);
            if (!regex.test(trimmed)) return { ok: false, error: "Value does not match required format" };
        } catch {
            return { ok: false, error: "Invalid input format definition" };
        }
    }

    if (entry.type === "number[]") {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return { ok: false, error: "Invalid number" };
        return { ok: true, parsedValue: parsed };
    }

    return { ok: true, parsedValue: trimmed };
}

export function Component() {
    const [entries, setEntries] = useState<UserProfileConfigEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
    const [arrayModal, setArrayModal] = useState<ArrayModalState | null>(null);
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
        const items = normalizeArrayValues(entry);
        setArrayModal({
            entry,
            items,
            originalItems: [...items],
            draftInput: "",
            inputValidation: { ok: true },
            editingIndex: null,
            editDraft: "",
            editValidation: { ok: true },
            isSaving: false,
        });
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
            const prevUserValue = entry.userValue;
            const updated = await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value: nextValue,
                knownValue: prevUserValue,
            });
            setEntries((current) => current.map((e) => (e.domain === entry.domain && e.key === entry.key ? { ...e, userValue: updated.userValue } : e)));
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
            const prevUserValue = entry.userValue;
            await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value: null,
                knownValue: prevUserValue,
            });
            setEntries((current) => current.map((e) => (e.domain === entry.domain && e.key === entry.key ? { ...e, userValue: null } : e)));
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
            const parsed = parseFloat(rawValue);
            if (isNaN(parsed)) {
                component.setHintText("Please enter a valid number");
                return;
            }
            value = parsed;
        }

        try {
            const prevUserValue = entry.userValue;
            await updateUserProfileConfigEntry(entry.domain, entry.key, {
                value,
                knownValue: prevUserValue,
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
        if (!arrayModal) return;
        setArrayModal((current) => current ? { ...current, isSaving: true } : current);
        try {
            const updated = await updateUserProfileConfigEntry(arrayModal.entry.domain, arrayModal.entry.key, {
                value: arrayModal.items,
                knownValue: arrayModal.entry.userValue,
            });
            setEntries((current) => current.map((e) => (e.domain === arrayModal.entry.domain && e.key === arrayModal.entry.key ? { ...e, userValue: updated.userValue } : e)));
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
        if (!acc.has(entry.domain)) acc.set(entry.domain, []);
        acc.get(entry.domain)!.push(entry);
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
                                    defaultValueDisplay = <code>{formatArraySummary({ ...entry, userValue: null })}</code>;
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
                                                    {formatArraySummary(entry)}
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

            <Dialog
                header={arrayModal ? `Edit ${arrayModal.entry.key}` : "Edit array"}
                visible={Boolean(arrayModal)}
                style={{ width: "min(860px, 95vw)" }}
                className="admin-config-dialog admin-config-dialog-array"
                modal
                onHide={() => setArrayModal(null)}
            >
                {arrayModal ? (
                    <div className="admin-config-array-editor">
                        <div className="admin-config-array-add-row">
                            <InputText
                                value={arrayModal.draftInput}
                                onChange={(event) => {
                                    const next = event.target.value;
                                    const validation = validateArrayItem(arrayModal.entry, next);
                                    setArrayModal((current) => {
                                        if (!current) return null;
                                        return {
                                            ...current,
                                            draftInput: next,
                                            inputValidation: validation.ok ? { ok: true } : { ok: false, error: validation.error },
                                        };
                                    });
                                }}
                                placeholder={arrayModal.entry.type === "number[]" ? "Add number" : "Add value"}
                            />
                            <button
                                type="button"
                                onClick={() => {
                                    const validation = validateArrayItem(arrayModal.entry, arrayModal.draftInput);
                                    if (!validation.ok) {
                                        setArrayModal((current) => current ? { ...current, inputValidation: { ok: false, error: validation.error } } : current);
                                        return;
                                    }
                                    setArrayModal((current) => {
                                        if (!current) return null;
                                        return {
                                            ...current,
                                            items: [...current.items, validation.parsedValue],
                                            draftInput: "",
                                            inputValidation: { ok: true },
                                        };
                                    });
                                }}
                            >
                                Add
                            </button>
                        </div>

                        {!arrayModal.inputValidation.ok ? (
                            <p className="admin-config-validation-error">{arrayModal.inputValidation.error}</p>
                        ) : null}

                        <ul className="admin-config-array-list">
                            {arrayModal.items.map((item, index) => {
                                const isEditing = arrayModal.editingIndex === index;
                                return (
                                    <li key={`${index}-${String(item)}`} className="admin-config-array-item">
                                        {isEditing ? (
                                            <div className="admin-config-array-item-edit">
                                                <InputText
                                                    value={arrayModal.editDraft}
                                                    onChange={(event) => {
                                                        const next = event.target.value;
                                                        const validation = validateArrayItem(arrayModal.entry, next);
                                                        setArrayModal((current) => {
                                                            if (!current) return null;
                                                            return {
                                                                ...current,
                                                                editDraft: next,
                                                                editValidation: validation.ok ? { ok: true } : { ok: false, error: validation.error },
                                                            };
                                                        });
                                                    }}
                                                />
                                                <button
                                                    type="button"
                                                    disabled={!arrayModal.editValidation.ok}
                                                    onClick={() => {
                                                        const validation = validateArrayItem(arrayModal.entry, arrayModal.editDraft);
                                                        if (!validation.ok) {
                                                            setArrayModal((current) => current ? { ...current, editValidation: { ok: false, error: validation.error } } : current);
                                                            return;
                                                        }
                                                        setArrayModal((current) => {
                                                            if (!current || current.editingIndex === null) return current;
                                                            const items = [...current.items];
                                                            items[current.editingIndex] = validation.parsedValue;
                                                            return {
                                                                ...current,
                                                                items,
                                                                editingIndex: null,
                                                                editDraft: "",
                                                                editValidation: { ok: true },
                                                            };
                                                        });
                                                    }}
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setArrayModal((current) => current ? {
                                                        ...current,
                                                        editingIndex: null,
                                                        editDraft: "",
                                                        editValidation: { ok: true },
                                                    } : current)}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    type="button"
                                                    className="admin-config-array-item-value"
                                                    onClick={() => setArrayModal((current) => current ? {
                                                        ...current,
                                                        editingIndex: index,
                                                        editDraft: String(item),
                                                        editValidation: { ok: true },
                                                    } : current)}
                                                >
                                                    {String(item)}
                                                </button>
                                                <div className="admin-config-array-item-actions">
                                                    <button
                                                        type="button"
                                                        onClick={() => setArrayModal((current) => current ? {
                                                            ...current,
                                                            items: current.items.filter((_, itemIndex) => itemIndex !== index),
                                                            editingIndex: current.editingIndex === index ? null : current.editingIndex,
                                                        } : current)}
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>

                        {!arrayModal.editValidation.ok ? (
                            <p className="admin-config-validation-error">{arrayModal.editValidation.error}</p>
                        ) : null}

                        <div className="admin-config-actions admin-top-gap">
                            <button
                                type="button"
                                disabled={arrayModal.isSaving}
                                onClick={() => setArrayModal((current) => {
                                    if (!current) return null;
                                    return {
                                        ...current,
                                        items: [...current.originalItems],
                                        draftInput: "",
                                        inputValidation: { ok: true },
                                        editingIndex: null,
                                        editDraft: "",
                                        editValidation: { ok: true },
                                    };
                                })}
                            >
                                Revert
                            </button>
                            <button
                                type="button"
                                disabled={arrayModal.isSaving}
                                onClick={() => void saveArrayModal()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : null}
            </Dialog>
        </PageTemplate>
    );
}
