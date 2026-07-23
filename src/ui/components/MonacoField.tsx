import { useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";

// ---------------------------------------------------------------------------
// Monaco Type Declarations
// ---------------------------------------------------------------------------

/** TypeScript type declarations registered with Monaco for IntelliSense. */
const MONACO_TYPES_DECLARATION = `
declare type DataTypeType = {
    identifier: string;
    name: string;
    disabled: boolean;
    description: string | null;
    kind: string;
    mandatory: boolean;
    requestorCanEdit: boolean;
    config: Record<string, unknown>;
    owner: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
};

declare type ProductRequestType = {
    identifier: string;
    productType: string | null;
    productNumber: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    createdBy: string | null;
    updatedBy: string | null;
};

declare type ProductType = {
    productTypeIdentifier: string;
    productNumber: string;
};
`;

let monacoTypesRegistered = false;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConfigSaveFn = (config: Record<string, unknown>) => Promise<void>;

// ---------------------------------------------------------------------------
// Monaco Editor with Save, Restore, and Clear buttons
// ---------------------------------------------------------------------------

export function MonacoField({
    label,
    value,
    originalValue,
    onChange,
    onSave,
    onRestore,
    height,
    helpText,
    isSaving,
    inheritedValue,
    onResetToParent,
}: {
    label: string;
    value: string | undefined;
    originalValue: string | undefined;
    onChange: (val: string | undefined) => void;
    onSave: () => Promise<void>;
    onRestore: () => void;
    height?: number;
    helpText?: string;
    isSaving?: boolean;
    inheritedValue?: string;
    onResetToParent?: () => void;
}) {
    const hasChanged = value !== originalValue;
    const isOverridden = value != null;

    const editorRef = useRef<any>(null);

    // When inheritedValue becomes available after the editor is mounted,
    // explicitly set the editor content so it shows the inherited value even
    // if the Editor component's internal state didn't pick up the prop change
    // (known race with @monaco-editor/react when value changes before
    // the underlying Monaco instance is ready).
    useEffect(() => {
        if (editorRef.current && value == null && inheritedValue != null) {
            const current = editorRef.current.getValue();
            if (current !== inheritedValue) {
                editorRef.current.setValue(inheritedValue);
            }
        }
    }, [value, inheritedValue]);

    const handleBeforeMount = (monaco: any) => {
        if (!monacoTypesRegistered) {
            monacoTypesRegistered = true;
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
                MONACO_TYPES_DECLARATION,
                "ts:types.d.ts",
            );
        }
    };

    return (
        <div className="admin-datatype-monaco-field">
            <label className="admin-datatype-monaco-label">
                {label}
                {value == null && inheritedValue != null ? (
                    <i className="pi pi-arrow-down-right" aria-hidden="true" title="Inherited from data type" style={{ marginLeft: "8px" }} />
                ) : null}
            </label>
            <Editor
                height={`${height ?? 200}px`}
                language="typescript"
                theme="vs-dark"
                value={value ?? inheritedValue ?? ""}
                onChange={(val) => onChange(val || undefined)}
                beforeMount={handleBeforeMount}
                onMount={(editor) => { editorRef.current = editor; }}
                options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                }}
            />
            {helpText ? (
                <div className="admin-datatype-monaco-help">
                    <code>{helpText}</code>
                </div>
            ) : null}
            <div className="admin-config-actions admin-top-gap">
                {hasChanged ? (
                    <>
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={() => void onSave()}
                            title="Save"
                        >
                            <i className="pi pi-save" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            disabled={isSaving}
                            onClick={onRestore}
                            title="Restore previous value"
                        >
                            <i className="pi pi-replay" aria-hidden="true" />
                        </button>
                    </>
                ) : null}
                {isOverridden && onResetToParent ? (
                    <button
                        type="button"
                        disabled={isSaving}
                        onClick={onResetToParent}
                        title="Reset to original"
                    >
                        <i className="pi pi-undo" aria-hidden="true" />
                    </button>
                ) : null}
                <button
                    type="button"
                    disabled={value === undefined || isSaving}
                    onClick={() => onChange(undefined)}
                    title="Clear"
                >
                    <i className="pi pi-times" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
