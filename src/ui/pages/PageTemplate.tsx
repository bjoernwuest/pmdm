import type { ReactNode } from "react";

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
};

export function PageSection({ title, children }: SectionProps) {
    return (
        <section className="template-page-section at-card">
            <div className="template-page-section-header">
                <h2 className="template-page-section-title">{title}</h2>
            </div>
            {children}
        </section>
    );
}

