import { useState, useEffect } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
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
// Props
// ---------------------------------------------------------------------------

interface ScriptEditorPopupProps {
    visible: boolean;
    onHide: () => void;
    title: string;
    script: string;
    onSave: (script: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ScriptEditorPopup({
    visible,
    onHide,
    title,
    script,
    onSave,
}: ScriptEditorPopupProps) {
    const [localScript, setLocalScript] = useState(script);
    const [saving, setSaving] = useState(false);

    // Sync localScript when the script prop changes (e.g., dialog re-opened with new content)
    useEffect(() => {
        setLocalScript(script);
    }, [script]);

    const handleBeforeMount = (monaco: any) => {
        if (!monacoTypesRegistered) {
            monacoTypesRegistered = true;
            monaco.languages.typescript.typescriptDefaults.addExtraLib(
                MONACO_TYPES_DECLARATION,
                "ts:types.d.ts",
            );
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(localScript);
            onHide();
        } finally {
            setSaving(false);
        }
    };

    const footer = (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
            <Button
                label="Cancel"
                icon="pi pi-times"
                className="p-button-outlined"
                onClick={onHide}
            />
            <Button
                label="Save"
                icon="pi pi-save"
                onClick={handleSave}
                loading={saving}
            />
        </div>
    );

    return (
        <Dialog
            header={title}
            visible={visible}
            onHide={onHide}
            style={{ width: "70vw" }}
            footer={footer}
            modal
            closable
            dismissableMask
        >
            <Editor
                height="400px"
                defaultLanguage="typescript"
                theme="vs-dark"
                value={localScript}
                onChange={(val) => setLocalScript(val ?? "")}
                beforeMount={handleBeforeMount}
                options={{
                    minimap: { enabled: false },
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                }}
            />
        </Dialog>
    );
}
