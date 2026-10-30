import { useState, type ReactNode } from "react";

type TemplateProps = {
    urn: string;
    title: string;
    description: string;
    actions?: ReactNode;
    children: ReactNode;
};

export function PageTemplate({ actions, children }: TemplateProps) {
    return (
        <div className="template-page">
            <header className="template-page-header">
                {actions ? <div className="template-page-actions">{actions}</div> : null}
            </header>
            <div className="template-page-main">{children}</div>
        </div>
    );
}

type SectionProps = {
    title: string;
    children: ReactNode;
    /** When `true`, the section title toggles its content. */
    collapsible?: boolean;
    /** Initial open state for collapsible sections. Defaults to open. */
    defaultOpen?: boolean;
};

export function PageSection({ title, children, collapsible = false, defaultOpen = true }: SectionProps) {
    const [open, setOpen] = useState(defaultOpen);

    if (collapsible) {
        return (
            <section className="template-page-section at-card">
                <button
                    type="button"
                    className="template-page-section-header"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "1rem",
                        width: "100%",
                        padding: 0,
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        textAlign: "left",
                        marginBottom: open ? "0.7rem" : 0,
                    }}
                >
                    <span className="template-page-section-title">{title}</span>
                    <i className={`pi ${open ? "pi-chevron-up" : "pi-chevron-down"}`} aria-hidden="true" />
                </button>
                {open ? children : null}
            </section>
        );
    }

    return (
        <section className="template-page-section at-card">
            <div className="template-page-section-header">
                <h2 className="template-page-section-title">{title}</h2>
            </div>
            {children}
        </section>
    );
}
