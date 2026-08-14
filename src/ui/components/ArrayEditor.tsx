import { Dialog } from "primereact/dialog";
import { InputText } from "primereact/inputtext";

export type ArrayItemValue = string | number;

/** Minimal entry shape the array editor needs (satisfied by the config entry types). */
export interface ArrayEditorEntry {
    type: string;
    inputFormat: string;
    value: unknown;
    key: string;
}

export type ArrayItemValidation =
    | { ok: true; parsedValue: ArrayItemValue }
    | { ok: false; error: string };

export type InlineType = "string" | "number" | "boolean";
export type ArrayType = "string[]" | "number[]";

export function isInlineType(type: string): type is InlineType {
    return type === "string" || type === "number" || type === "boolean";
}

export function isArrayType(type: string): type is ArrayType {
    return type === "string[]" || type === "number[]";
}

export function normalizeArrayValues(entry: { type: string; value?: unknown }): ArrayItemValue[] {
    if (!Array.isArray(entry.value)) return [];
    if (entry.type === "number[]") {
        return entry.value
            .map((item) => (typeof item === "number" ? item : Number(item)))
            .filter((item) => Number.isFinite(item));
    }
    return entry.value.map((item) => String(item));
}

export function validateArrayItem(entry: { type: string; inputFormat: string }, raw: string): ArrayItemValidation {
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

export function formatArraySummary(entry: { type: string; value?: unknown }): string {
    const values = normalizeArrayValues(entry);
    if (values.length === 0) return "[]";
    return JSON.stringify(values);
}

export interface ArrayEditorModalState {
    entry: ArrayEditorEntry;
    items: ArrayItemValue[];
    originalItems: ArrayItemValue[];
    draftInput: string;
    inputValidation: { ok: true } | { ok: false; error: string };
    editingIndex: number | null;
    editDraft: string;
    editValidation: { ok: true } | { ok: false; error: string };
    isSaving: boolean;
}

/** Creates the initial modal state for an entry (items normalized from its current value). */
export function openArrayEditor(entry: ArrayEditorEntry): ArrayEditorModalState {
    const items = normalizeArrayValues(entry);
    return {
        entry,
        items,
        originalItems: items,
        draftInput: "",
        inputValidation: { ok: true },
        editingIndex: null,
        editDraft: "",
        editValidation: { ok: true },
        isSaving: false,
    };
}

export interface ArrayEditorDialogProps {
    state: ArrayEditorModalState;
    onChange: (updater: (current: ArrayEditorModalState) => ArrayEditorModalState | null) => void;
    onClose: () => void;
    onSave: () => void;
}

/**
 * Shared array-editor dialog: add/edit/remove/revert state machine over the items of an
 * array-typed config entry. Used by both config pages; page-specific wiring (the save
 * mutation) is passed in via `onSave`.
 */
export function ArrayEditorDialog({ state, onChange, onClose, onSave }: ArrayEditorDialogProps) {
    return (
        <Dialog
            header={`Edit ${state.entry.key}`}
            visible={Boolean(state)}
            style={{ width: "min(860px, 95vw)" }}
            className="admin-config-dialog admin-config-dialog-array"
            modal
            onHide={onClose}
        >
            <div className="admin-config-array-editor">
                <div className="admin-config-array-add-row">
                    <InputText
                        value={state.draftInput}
                        onChange={(event) => {
                            const next = event.target.value;
                            const validation = validateArrayItem(state.entry, next);
                            onChange((current) => {
                                if (!current) return null;
                                return {
                                    ...current,
                                    draftInput: next,
                                    inputValidation: validation.ok ? { ok: true } : { ok: false, error: validation.error },
                                };
                            });
                        }}
                        placeholder={state.entry.type === "number[]" ? "Add number" : "Add value"}
                    />
                    <button
                        type="button"
                        onClick={() => {
                            const validation = validateArrayItem(state.entry, state.draftInput);
                            if (!validation.ok) {
                                onChange((current) => current ? { ...current, inputValidation: { ok: false, error: validation.error } } : current);
                                return;
                            }
                            onChange((current) => {
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

                {!state.inputValidation.ok ? (
                    <p className="admin-config-validation-error">{state.inputValidation.error}</p>
                ) : null}

                <ul className="admin-config-array-list">
                    {state.items.map((item, index) => {
                        const isEditing = state.editingIndex === index;
                        return (
                            <li key={`${index}-${String(item)}`} className="admin-config-array-item">
                                {isEditing ? (
                                    <div className="admin-config-array-item-edit">
                                        <InputText
                                            value={state.editDraft}
                                            onChange={(event) => {
                                                const next = event.target.value;
                                                const validation = validateArrayItem(state.entry, next);
                                                onChange((current) => {
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
                                            disabled={!state.editValidation.ok}
                                            onClick={() => {
                                                const validation = validateArrayItem(state.entry, state.editDraft);
                                                if (!validation.ok) {
                                                    onChange((current) => current ? { ...current, editValidation: { ok: false, error: validation.error } } : current);
                                                    return;
                                                }
                                                onChange((current) => {
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
                                            onClick={() => onChange((current) => current ? {
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
                                            onClick={() => onChange((current) => current ? {
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
                                                onClick={() => onChange((current) => current ? {
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

                {!state.editValidation.ok ? (
                    <p className="admin-config-validation-error">{state.editValidation.error}</p>
                ) : null}

                <div className="admin-config-actions admin-top-gap">
                    <button
                        type="button"
                        disabled={state.isSaving}
                        onClick={() => onChange((current) => {
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
                        disabled={state.isSaving}
                        onClick={onSave}
                    >
                        Save
                    </button>
                </div>
            </div>
        </Dialog>
    );
}
