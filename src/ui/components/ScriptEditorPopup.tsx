import { useState, useEffect } from "react";
import { Dialog } from "primereact/dialog";
import { Button } from "primereact/button";
import Editor from "@monaco-editor/react";
import { registerMonacoTypes } from "./MonacoTypesDeclaration.ts";

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
        registerMonacoTypes(monaco);
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
