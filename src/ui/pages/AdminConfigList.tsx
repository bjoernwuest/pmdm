import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import { Dialog } from "primereact/dialog";
import { ArrayEditorDialog, formatArraySummary, isArrayType, isInlineType, openArrayEditor, type ArrayEditorModalState } from "@/ui/components/ArrayEditor";
import Toggle, { type ToggleHandle } from "@/ui/components/Toggle";
import { InputText } from "primereact/inputtext";
import InputField, { formatterRegistry, type InputFieldHandle } from "@/ui/components/InputField";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type {
    ConfigDomainGroup,
} from "@/types/ConfigType.ts";
import type { PageMeta } from "@/types/PageType.ts";
import { getConfigEntries, updateConfigEntry } from "@/ui/api/Config.ts";
import { getUserProfileConfigEntries } from "@/ui/api/UserProfileConfig.ts";
import { ApiError } from "@/ui/api/errors.ts";
import { FP_MANAGE_CONFIGURATION } from "@/ui/auth/functional_permissions.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub.ts";
import { runSaveWithConfirmation } from "@/ui/saveConfirmation";
import { TAG_CONFIG, TAG_UPDATE } from "@/types/PubSubType";
import type { PubSubMessage } from "@/types/PubSubType";
import type { ConfigEntryUI } from "@/types/ConfigType.ts";
import type { InputFormatter } from "@/ui/components/InputField/formatters/types";

type ValidationResult =
    | { ok: true; parsedValue: unknown }
    | { ok: false; error: string };

type InlineEditState = {
    configKey: string;
};

type ObjectModalState = {
    entry: ConfigEntryUI;
    draftRaw: string;
    originalRaw: string;
    validation: ValidationResult;
    schemaError: string | null;
    monacoErrorCount: number;
    isSaving: boolean;
};

export const meta: PageMeta = {
    id: "admin-config",
    urn: "urn:bun-starter:ui:page:admin-config",
    path: "/admin/config",
    title: "Configuration",
    description: "View and edit application configuration entries.",
    menu: {
        section: "Administration",
        order: 50,
        label: "Configuration",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_MANAGE_CONFIGURATION.functionalPermissionName],
};

function rowId(entry: ConfigEntryUI): string {
    return `${entry.domain}::${entry.key}`;
}

function isObjectType(type: ConfigEntryUI["type"]): boolean {
    return type === "object";
}

function toJsonString(value: unknown): string {
    try {
        return JSON.stringify(value ?? null, null, 2);
    } catch {
        return String(value ?? "");
    }
}

function toInlineDraftValue(entry: ConfigEntryUI): string | number | boolean {
    if (entry.type === "number") {
        if (typeof entry.value === "number" && Number.isFinite(entry.value)) return entry.value;
        const parsed = Number(entry.value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    if (entry.type === "boolean") {
        if (typeof entry.value === "boolean") return entry.value;
        return entry.value === "true" || entry.value === "1" || entry.value === 1;
    }

    return typeof entry.value === "string" ? entry.value : String(entry.value ?? "");
}

function parseObjectSchema(inputFormat: string): { schema: Record<string, unknown> | null; error: string | null } {
    if (!inputFormat || inputFormat.trim().length === 0) return { schema: null, error: null };

    try {
        const parsed = JSON.parse(inputFormat);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { schema: null, error: "inputFormat must be a JSON Schema object" };
        }
        return { schema: parsed as Record<string, unknown>, error: null };
    } catch {
        return { schema: null, error: "inputFormat is not valid JSON Schema" };
    }
}

function validateScalarValue(entry: ConfigEntryUI, raw: unknown): ValidationResult {
    let parsed: unknown;

    switch (entry.type) {
        case "number": {
            const num = typeof raw === "number" ? raw : Number(raw);
            if (!Number.isFinite(num)) return { ok: false, error: "Invalid number" };
            parsed = num;
            break;
        }
        case "boolean": {
            if (typeof raw === "boolean") {
                parsed = raw;
                break;
            }
            if (raw === "true" || raw === "1" || raw === 1) {
                parsed = true;
                break;
            }
            if (raw === "false" || raw === "0" || raw === 0) {
                parsed = false;
                break;
            }
            return { ok: false, error: "Invalid boolean" };
        }
        case "string":
        default:
            parsed = String(raw ?? "");
    }

    if (entry.inputFormat && entry.inputFormat.trim().length > 0 && (entry.type === "string" || entry.type === "number")) {
        const asString = typeof raw === "string" ? raw : String(raw ?? "");
        try {
            const regex = new RegExp(entry.inputFormat);
            if (!regex.test(asString)) return { ok: false, error: "Value does not match required format" };
        } catch {
            return { ok: false, error: "Invalid input format definition" };
        }
    }

    return { ok: true, parsedValue: parsed };
}

function validateObjectValue(raw: string): ValidationResult {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            return { ok: false, error: "Value must be a JSON object" };
        }
        return { ok: true, parsedValue: parsed };
    } catch {
        return { ok: false, error: "Invalid JSON object" };
    }
}

function formatScalarValue(entry: ConfigEntryUI): string {
    if (entry.type === "boolean") return entry.value === true ? "Enabled" : "Disabled";
    if (entry.type === "number") return typeof entry.value === "number" ? String(entry.value) : String(Number(entry.value ?? 0));
    return String(entry.value ?? "");
}

function mergeUpdatedEntry(groups: ConfigDomainGroup[], updated: ConfigEntryUI): ConfigDomainGroup[] {
    return groups.map((group) => {
        if (group.domain !== updated.domain) return group;
        return {
            ...group,
            entries: group.entries.map((entry) => (entry.key === updated.key ? { ...entry, ...updated } : entry)),
        };
    });
}

function JsonPreviewEditor({ value, onOpen }: { value: unknown; onOpen: () => void }) {
    const serialized = useMemo(() => toJsonString(value), [value]);

    return (
        <div
            className="admin-config-json-preview"
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen();
                }
            }}
            aria-label="Open JSON editor dialog"
        >
            <Editor
                height="140px"
                defaultLanguage="json"
                value={serialized}
                options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    lineNumbers: "off",
                    folding: false,
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    automaticLayout: true,
                    domReadOnly: true,
                }}
            />
        </div>
    );
}

export function Component() {
    const [groups, setGroups] = useState<ConfigDomainGroup[]>([]);
    // Latest-committed mirror so callbacks (handleChange) never read a stale `groups` closure.
    const groupsRef = useRef<ConfigDomainGroup[]>([]);
    useEffect(() => {
        groupsRef.current = groups;
    }, [groups]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [inlineEdit, setInlineEdit] = useState<InlineEditState | null>(null);
    const [objectModal, setObjectModal] = useState<ObjectModalState | null>(null);
    const [arrayModal, setArrayModal] = useState<ArrayEditorModalState | null>(null);
    const [arrayEditorEntry, setArrayEditorEntry] = useState<ConfigEntryUI | null>(null);
    const [userProfileOverrides, setUserProfileOverrides] = useState<Map<string, unknown>>(new Map());

    const inputEntryRef = useRef<InputFieldHandle | null>(null);
    const booleanToggleRef = useRef<ToggleHandle<boolean> | null>(null);

    const loadEntries = useCallback(async () => {
        // Profile-override failures are part of the combined load: they reject into the
        // page's existing load-error path instead of rendering a silently-empty override map.
        const [payload, profilePayload] = await Promise.all([
            getConfigEntries(),
            getUserProfileConfigEntries(),
        ]);
        setGroups(payload.domains);
        const overrideMap = new Map<string, unknown>();
        for (const entry of profilePayload.entries) {
            if (entry.userValue !== null && entry.userValue !== undefined) {
                overrideMap.set(`${entry.domain}::${entry.key}`, entry.userValue);
            }
        }
        setUserProfileOverrides(overrideMap);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsLoading(true);
        loadEntries()
            .catch((err) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load configuration entries");
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [loadEntries]);

    function resolveFormatter(entry: ConfigEntryUI): InputFormatter | undefined {
        return formatterRegistry.get(entry.inputFormat);
    }

    const startInlineEdit = (configKey: string) => {
        setInlineEdit({ configKey });
        setObjectModal(null);
        setArrayModal(null);
        setError(null);
    };

    const startObjectModal = (entry: ConfigEntryUI) => {
        const raw = toJsonString(entry.value);
        const schemaParse = parseObjectSchema(entry.inputFormat);
        setObjectModal({
            entry,
            draftRaw: raw,
            originalRaw: raw,
            validation: validateObjectValue(raw),
            schemaError: schemaParse.error,
            monacoErrorCount: 0,
            isSaving: false,
        });
        setInlineEdit(null);
        setArrayModal(null);
        setError(null);
    };

    const startArrayModal = (entry: ConfigEntryUI) => {
        if (!isArrayType(entry.type)) return;
        setArrayEditorEntry(entry);
        setArrayModal(openArrayEditor({ type: entry.type, inputFormat: entry.inputFormat, value: entry.value, key: entry.key }));
        setInlineEdit(null);
        setObjectModal(null);
        setError(null);
    };

    // The specific entry being edited (derived once per groups/inlineEdit change) so the
    // edit effects do not re-subscribe/re-seed on unrelated entries' updates.
    const editingEntry = useMemo(() => {
        if (!inlineEdit) return undefined;
        return groups
            .flatMap(g => g.entries)
            .find(e => e.key === inlineEdit.configKey);
    }, [groups, inlineEdit]);

    // Mount effect: set initial value and subscribe to concurrent modifications
    useEffect(() => {
        if (inlineEdit && inputEntryRef.current) {
            const entry = editingEntry;
            if (entry) {
                const strVal = String(entry.value ?? "");
                inputEntryRef.current.setOriginalValue(strVal, {
                    updatedAt: entry.updatedAt,
                    domain: entry.domain,
                    key: entry.key,
                    value: entry.value,
                });
                inputEntryRef.current.resetToOriginal();

                const formatter = resolveFormatter(entry);
                if (formatter) {
                    inputEntryRef.current.setFormatter(formatter);
                }

                // Subscribe to concurrent modifications for this specific entry
                const token = subscribe(
                    { and: [TAG_CONFIG, entry.domain, entry.key, TAG_UPDATE] },
                    (msg: PubSubMessage) => {
                        const newValue = String(msg.data?.value ?? "");
                        const ref = inputEntryRef.current;
                        if (!ref) return;

                        if (msg.data?.value !== undefined && newValue !== String(entry.value)) {
                            ref.setOriginalValue(newValue, {
                                updatedAt: msg.data?.updatedAt,
                                domain: entry.domain,
                                key: entry.key,
                                value: msg.data?.value,
                            });
                            ref.setDirty(true);
                            ref.setHintText("Value was modified by another user");
                        }
                    }
                );

                if (token) {
                    const ctx = inputEntryRef.current.getContext();
                    if (ctx) {
                        ctx.subscriptionId = token;
                    }
                }
            }
        }

        return () => {
            if (inputEntryRef.current) {
                const ctx = inputEntryRef.current.getContext();
                if (ctx?.subscriptionId) {
                    unsubscribe(ctx.subscriptionId as string);
                }
            }
        };
    }, [inlineEdit, editingEntry]);

    // PubSub subscription for boolean toggle (inline edit mode)
    useEffect(() => {
        if (!inlineEdit || !booleanToggleRef.current) return;

        const entry = editingEntry;
        if (!entry || entry.type !== "boolean") return;

        // Set initial confirmed value and context
        booleanToggleRef.current.setValue(Boolean(entry.value), {
            configKey: entry.key,
            domain: entry.domain,
            updatedAt: entry.updatedAt,
            value: entry.value,
        });

        const token = subscribe(
            { and: [TAG_CONFIG, entry.domain, entry.key, TAG_UPDATE] },
            (msg: PubSubMessage) => {
                const ref = booleanToggleRef.current;
                if (!ref) return;

                const newValue = Boolean(msg.data?.value);
                if (msg.data?.key === entry.key && newValue !== ref.getValue()) {
                    ref.setDirty(true);
                    ref.setHintText("Value was modified by another user");
                }
            }
        );

        return () => {
            if (token) unsubscribe(token);
        };
    }, [inlineEdit, editingEntry]);

    // Passive PubSub subscription for display updates (non-editing rows)
    useEffect(() => {
        const token = subscribe(
            { and: [TAG_CONFIG] },
            (msg: PubSubMessage) => {
                const { domain, key, value } = msg.data ?? {};
                if (domain && key && value !== undefined) {
                    setGroups(prev => prev.map(group => {
                        if (group.domain !== domain) return group;
                        return {
                            ...group,
                            entries: group.entries.map(e =>
                                e.key === key ? { ...e, value, updatedAt: msg.data?.updatedAt } as ConfigEntryUI : e
                            ),
                        };
                    }));
                }
            }
        );
        return () => { if (token) unsubscribe(token); };
    }, []);

    const handleChange = (component: InputFieldHandle) => {
        const value = component.getCurrentValue();
        const entry = groupsRef.current
            .flatMap(g => g.entries)
            .find(e => e.key === inlineEdit?.configKey);

        if (!entry) return;

        if (entry.type === "number") {
            if (value !== "" && !/^-?\d*\.?\d*$/.test(value)) {
                component.setHintText("Enter a valid number");
            } else {
                component.setHintText("");
            }
        }
    };

    const handleSave = async (
        component: InputFieldHandle,
        source: "button" | "blur",
        entry: ConfigEntryUI,
    ) => {
        if (!inlineEdit) return;

        const rawValue = component.getCurrentValue();

        // Skip save if value is unchanged
        if (!component.compareWithOriginal()) {
            setInlineEdit(null);
            return;
        }

        // Number conversion
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

        // inputFormat regex validation
        if (entry.inputFormat && !formatterRegistry.has(entry.inputFormat)) {
            try {
                const regex = new RegExp(entry.inputFormat);
                if (!regex.test(String(value))) {
                    const msg = `Value must match pattern: ${entry.inputFormat}`;
                    component.setHintText(msg);
                    setError(msg);
                    return;
                }
            } catch { /* invalid regex — defer to server */ }
        }

        const ctx = component.getContext();

        component.disableSaveButton();
        component.disableRestoreButton();

        await runSaveWithConfirmation({
            pubsubExpression: { and: [TAG_CONFIG, entry.domain, entry.key, TAG_UPDATE] },
            confirmFromPubSub: async (msg) => ({
                value: String(msg.data?.value ?? ""),
                updatedAt: (typeof msg.data?.updatedAt === "string" ? msg.data.updatedAt : undefined) ?? (typeof ctx?.updatedAt === "string" ? ctx.updatedAt : undefined) ?? "",
            }),
            confirmFromRefetch: async () => {
                const payload = await getConfigEntries();
                const updated = payload.domains
                    .flatMap(d => d.entries)
                    .find(e => e.domain === entry.domain && e.key === entry.key);
                if (!updated) return undefined;
                return {
                    value: String(updated.value ?? ""),
                    updatedAt: updated.updatedAt ?? (typeof ctx?.updatedAt === "string" ? ctx.updatedAt : undefined) ?? "",
                };
            },
            mutate: async () => {
                const response = await updateConfigEntry(entry.domain, entry.key, {
                    value,
                    knownUpdatedAt: (typeof ctx?.updatedAt === "string" ? ctx.updatedAt : undefined) ?? entry.updatedAt ?? "",
                });
                return {
                    value: String(response.value ?? ""),
                    updatedAt: response.updatedAt ?? (typeof ctx?.updatedAt === "string" ? ctx.updatedAt : undefined) ?? "",
                };
            },
            onSuccess: (newValue, newUpdatedAt) => {
                component.setOriginalValue(String(newValue ?? ""), {
                    updatedAt: newUpdatedAt,
                    domain: entry.domain,
                    key: entry.key,
                    value: newValue,
                });
                component.setDirty(false);
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
                setInlineEdit(null);
            },
            onTimeoutFailure: () => {
                component.enableSaveButton();
                component.enableRestoreButton();
                component.setHintText("");
                setInlineEdit(null);
            },
            onConflict: () => {
                component.setHintText("This value was modified by another user. Please refresh.");
                component.setDirty(true);
                component.enableRestoreButton();
                setError("Conflict: value was modified elsewhere");
            },
            onOtherError: (err) => {
                component.enableSaveButton();
                component.enableRestoreButton();
                setError(err instanceof Error ? err.message : "Failed to save");
            },
        });
    };

    const saveObjectModal = async () => {
        if (!objectModal || !objectModal.validation.ok) return;
        setObjectModal((current) => current ? { ...current, isSaving: true } : current);
        try {
            const updated = await updateConfigEntry(objectModal.entry.domain, objectModal.entry.key, {
                value: objectModal.validation.parsedValue,
                knownUpdatedAt: objectModal.entry.updatedAt ?? "",
            });
            setGroups((current) => mergeUpdatedEntry(current, updated));
            setObjectModal(null);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError("Configuration changed by another user. Reloading latest values...");
                await loadEntries();
                setObjectModal(null);
                return;
            }
            setObjectModal((current) => current ? { ...current, isSaving: false } : current);
            setError(err instanceof Error ? err.message : "Unable to save configuration value");
        }
    };

    const saveArrayModal = async () => {
        if (!arrayModal || !arrayEditorEntry) return;
        setArrayModal((current) => current ? { ...current, isSaving: true } : current);
        try {
            const updated = await updateConfigEntry(arrayEditorEntry.domain, arrayEditorEntry.key, {
                value: arrayModal.items,
                knownUpdatedAt: arrayEditorEntry.updatedAt ?? "",
            });
            setGroups((current) => mergeUpdatedEntry(current, updated));
            setArrayModal(null);
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                setError("Configuration changed by another user. Reloading latest values...");
                await loadEntries();
                setArrayModal(null);
                return;
            }
            setArrayModal((current) => current ? { ...current, isSaving: false } : current);
            setError(err instanceof Error ? err.message : "Unable to save configuration value");
        }
    };

    const objectModalSaveDisabled = !objectModal
        || objectModal.schemaError !== null
        || !objectModal.validation.ok
        || objectModal.monacoErrorCount > 0
        || objectModal.isSaving
        || objectModal.draftRaw === objectModal.originalRaw;

    const objectModalSchema = useMemo(() => {
        if (!objectModal) return null;
        return parseObjectSchema(objectModal.entry.inputFormat).schema;
    }, [objectModal]);

    type MonacoJsonDefaults = {
        setDiagnosticsOptions(options: {
            validate?: boolean;
            allowComments?: boolean;
            enableSchemaRequest?: boolean;
            schemas?: { uri: string; fileMatch: string[]; schema: unknown }[];
        }): void;
    };

    // The Monaco `jsonDefaults` diagnostics options are global; the schema is scoped by
    // model URI (fileMatch), and the options are reset when the object dialog closes so no
    // schema leaks into other JSON editors after the dialog was used.
    const monacoInstanceRef = useRef<typeof import("monaco-editor") | null>(null);

    const configureObjectSchema = (monaco: typeof import("monaco-editor")) => {
        monacoInstanceRef.current = monaco;
        if (!objectModal) return;
        const modelPath = `inmemory://model/config/${encodeURIComponent(objectModal.entry.domain)}/${encodeURIComponent(objectModal.entry.key)}.json`;
        const schema = objectModalSchema;
        // The public monaco typings do not declare the dynamically-registered json
        // contribution; the access is validated at runtime before use.
        const jsonContribution: unknown = monaco.languages.json;
        const jsonDefaults = (typeof jsonContribution === "object" && jsonContribution !== null && "jsonDefaults" in jsonContribution)
            ? (jsonContribution as { jsonDefaults: MonacoJsonDefaults }).jsonDefaults
            : undefined;
        if (!jsonDefaults) return;
        jsonDefaults.setDiagnosticsOptions({
            validate: true,
            allowComments: false,
            enableSchemaRequest: true,
            schemas: schema ? [{ uri: `config-schema://${objectModal.entry.domain}/${objectModal.entry.key}`, fileMatch: [modelPath], schema }] : [],
        });
    };

    const resetObjectSchema = () => {
        const monaco = monacoInstanceRef.current;
        if (!monaco) return;
        const jsonContribution: unknown = monaco.languages.json;
        const jsonDefaults = (typeof jsonContribution === "object" && jsonContribution !== null && "jsonDefaults" in jsonContribution)
            ? (jsonContribution as { jsonDefaults: MonacoJsonDefaults }).jsonDefaults
            : undefined;
        if (!jsonDefaults) return;
        jsonDefaults.setDiagnosticsOptions({
            validate: true,
            allowComments: false,
            enableSchemaRequest: true,
            schemas: [],
        });
        monacoInstanceRef.current = null;
    };

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error ? <p className="admin-config-error">{error}</p> : null}

            {isLoading ? <p>Loading configuration entries...</p> : null}

            {!isLoading && groups.length === 0 ? (
                <PageSection title="Configuration">
                    <p>No configuration entries found.</p>
                </PageSection>
            ) : null}

            {!isLoading && groups.map((group) => (
                <PageSection key={group.domain} title={group.domain}>
                    <table className="mui-simple-table admin-table admin-config-table">
                        <thead>
                        <tr>
                            <th>Key</th>
                            <th>Description</th>
                            <th>Value</th>
                        </tr>
                        </thead>
                        <tbody>
                        {group.entries.map((entry) => {
                            const id = rowId(entry);
                            const isEditingInline = inlineEdit?.configKey === entry.key;

                            return (
                                <tr key={id}>
                                    <td>
                                        {entry.userProfile ? (
                                            <span className="admin-config-user-profile-badge" title="This setting can be overridden per user in the User Profile">User Profile</span>
                                        ) : null}
                                        <code>{entry.key}</code>
                                    </td>
                                    <td>{entry.description ?? "-"}</td>
                                    <td>
                                        {isEditingInline && entry.type !== "boolean" ? (
                                            <InputField
                                                ref={inputEntryRef}
                                                showButtons={true}
                                                onChange={handleChange}
                                                onSave={(component, source) => handleSave(component, source, entry)}
                                            />
                                        ) : isEditingInline && entry.type === "boolean" ? (
                                            <div className="admin-toggle-row">
                                                <Toggle<boolean>
                                                    ref={booleanToggleRef}
                                                    variant="toggle"
                                                    value={Boolean(entry.value)}
                                                    options={[{ value: true, label: "Enabled" }, { value: false, label: "Disabled" }]}
                                                    onChange={async (t) => {
                                                        const next = t.getValue();
                                                        try {
                                                            const updated = await updateConfigEntry(entry.domain, entry.key, {
                                                                value: next,
                                                                knownUpdatedAt: entry.updatedAt ?? "",
                                                            });
                                                            setGroups((current) => mergeUpdatedEntry(current, updated));
                                                            t.setValue(next, {
                                                                configKey: entry.key,
                                                                domain: entry.domain,
                                                                updatedAt: updated.updatedAt,
                                                                value: next,
                                                            });
                                                        } catch (err) {
                                                            if (err instanceof ApiError && err.status === 409) {
                                                                setError("Configuration changed by another user. Reloading latest values...");
                                                                await loadEntries();
                                                                t.revertValue();
                                                                return;
                                                            }
                                                            setError(err instanceof Error ? err.message : "Unable to save configuration value");
                                                        }
                                                    }}
                                                />
                                            </div>
                                        ) : !isEditingInline ? (
                                            <>
                                                {isObjectType(entry.type) ? (
                                                    <JsonPreviewEditor value={entry.value} onOpen={() => startObjectModal(entry)} />
                                                ) : null}
                                                {isArrayType(entry.type) ? (
                                                    <button
                                                        type="button"
                                                        className="admin-config-value-button"
                                                        onClick={() => startArrayModal(entry)}
                                                    >
                                                        {formatArraySummary(entry)}
                                                    </button>
                                                ) : null}
                                                {isInlineType(entry.type) ? (
                                                    <button
                                                        type="button"
                                                        className="admin-config-value-button"
                                                        onClick={() => startInlineEdit(entry.key)}
                                                    >
                                                        {formatScalarValue(entry)}
                                                    </button>
                                                ) : null}
                                                {entry.userProfile && userProfileOverrides.has(`${entry.domain}::${entry.key}`) ? (
                                                    <div className="admin-config-user-default-hint">
                                                        User default: {JSON.stringify(userProfileOverrides.get(`${entry.domain}::${entry.key}`))}
                                                    </div>
                                                ) : null}
                                            </>
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
                header={objectModal ? `Edit ${objectModal.entry.key}` : "Edit configuration"}
                visible={Boolean(objectModal)}
                style={{ width: "min(980px, 95vw)" }}
                className="admin-config-dialog admin-config-dialog-object"
                modal
                onHide={() => {
                    resetObjectSchema();
                    setObjectModal(null);
                }}
            >
                {objectModal ? (
                    <div className="admin-config-modal-body">
                        {objectModal.schemaError ? <p className="admin-config-validation-error">{objectModal.schemaError}</p> : null}
                        <Editor
                            height="340px"
                            defaultLanguage="json"
                            language="json"
                            path={`inmemory://model/config/${encodeURIComponent(objectModal.entry.domain)}/${encodeURIComponent(objectModal.entry.key)}.json`}
                            value={objectModal.draftRaw}
                            beforeMount={configureObjectSchema}
                            onValidate={(markers: MonacoEditor.IMarker[]) => {
                                const errors = markers.filter((marker) => marker.severity === 8).length;
                                setObjectModal((current) => current ? { ...current, monacoErrorCount: errors } : current);
                            }}
                            onChange={(value: string | undefined) => {
                                const next = value ?? "";
                                setObjectModal((current) => {
                                    if (!current) return null;
                                    return {
                                        ...current,
                                        draftRaw: next,
                                        validation: validateObjectValue(next),
                                    };
                                });
                            }}
                            options={{
                                minimap: { enabled: false },
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                wordWrap: "on",
                                formatOnPaste: true,
                                formatOnType: true,
                            }}
                        />

                        {!objectModal.validation.ok ? <p className="admin-config-validation-error">{objectModal.validation.error}</p> : null}

                        <div className="admin-config-actions admin-top-gap">
                            <button
                                type="button"
                                disabled={objectModal.isSaving}
                                onClick={() => setObjectModal((current) => {
                                    if (!current) return null;
                                    return {
                                        ...current,
                                        draftRaw: current.originalRaw,
                                        validation: validateObjectValue(current.originalRaw),
                                        monacoErrorCount: 0,
                                    };
                                })}
                            >
                                Revert
                            </button>
                            <button type="button" disabled={objectModalSaveDisabled} onClick={() => void saveObjectModal()}>Save</button>
                        </div>
                    </div>
                ) : null}
            </Dialog>

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

