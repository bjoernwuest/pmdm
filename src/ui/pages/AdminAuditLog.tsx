import { useCallback, useEffect, useState } from "react";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { FP_CLEAR_AUDIT_LOG, FP_READ_AUDIT_LOG } from "@/ui/auth/functional_permissions.ts";
import { clearAuditLog, getAuditEntries, type AuditEntry } from "@/ui/api/AuditLog.ts";
import { apiGet } from "@/ui/api/index.ts";
import { InputText } from "primereact/inputtext";

type ViewerContext = { permissionNames: string[] };

export const meta: PageMeta = {
    id: "admin-audit-log",
    urn: "urn:bun-starter:ui:page:admin-audit-log",
    path: "/admin/audit-log",
    title: "Audit Log",
    description: "View and search the audit log of all data-changing events in the system.",
    menu: {
        section: "Administration",
        order: 90,
        label: "Audit Log",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_READ_AUDIT_LOG.functionalPermissionName],
};

const PAGE_SIZE = 50;

function formatPayload(payload: Record<string, any>): string {
    try {
        return JSON.stringify(payload, null, 2);
    } catch {
        return String(payload);
    }
}

function formatTimestamp(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

export function Component() {
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [jsonPathFilter, setJsonPathFilter] = useState("");
    const [search, setSearch] = useState("");
    const [appliedJsonPath, setAppliedJsonPath] = useState("");
    const [appliedSearch, setAppliedSearch] = useState("");
    const [isClearing, setIsClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const canClear = viewerContext.permissionNames.includes(FP_CLEAR_AUDIT_LOG.functionalPermissionName);

    const applyFilters = useCallback(() => {
        setAppliedJsonPath(jsonPathFilter.trim());
        setAppliedSearch(search.trim());
        setPage(0);
    }, [jsonPathFilter, search]);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [context, payload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getAuditEntries(page, PAGE_SIZE, {
                    jsonPathFilter: appliedJsonPath || undefined,
                    search: appliedSearch || undefined,
                }),
            ]);
            setViewerContext(context);
            setEntries(payload.entries);
            setTotal(payload.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load audit log");
        } finally {
            setIsLoading(false);
        }
    }, [page, appliedJsonPath, appliedSearch]);

    useEffect(() => {
        void load();
    }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleClear = async () => {
        setIsClearing(true);
        setError(null);
        try {
            await clearAuditLog();
            setConfirmClear(false);
            // Reload the first page
            setPage(0);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not clear audit log");
        } finally {
            setIsClearing(false);
        }
    };

    const [expandedPayload, setExpandedPayload] = useState<string | null>(null);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Audit Log Entries">
                {error ? <p className="admin-config-error">{error}</p> : null}

                <div className="admin-config-actions" style={{ marginBottom: "1rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem" }}>
                        JSONPath filter
                        <InputText
                            value={jsonPathFilter}
                            onChange={(e) => setJsonPathFilter(e.target.value)}
                            placeholder='e.g. $.key == "value"'
                            style={{ width: "220px" }}
                            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem" }}>
                        Search
                        <InputText
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search topic or payload..."
                            style={{ width: "220px" }}
                            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                        />
                    </label>
                    <button type="button" onClick={applyFilters}>Apply Filters</button>
                    {(appliedJsonPath || appliedSearch) ? (
                        <button
                            type="button"
                            onClick={() => {
                                setJsonPathFilter("");
                                setSearch("");
                                setAppliedJsonPath("");
                                setAppliedSearch("");
                                setPage(0);
                            }}
                        >
                            Clear Filters
                        </button>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    {canClear ? (
                        confirmClear ? (
                            <>
                                <span style={{ color: "var(--color-danger, #d32f2f)", fontSize: "0.875rem" }}>Really clear all entries?</span>
                                <button type="button" onClick={handleClear} disabled={isClearing}>
                                    {isClearing ? "Clearing..." : "Confirm Clear"}
                                </button>
                                <button type="button" onClick={() => setConfirmClear(false)} disabled={isClearing}>
                                    Cancel
                                </button>
                            </>
                        ) : (
                            <button type="button" onClick={() => setConfirmClear(true)} disabled={isClearing}>
                                Clear Audit Log
                            </button>
                        )
                    ) : null}
                </div>

                {isLoading ? (
                    <p>Loading audit log...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "200px" }}>Timestamp</th>
                                    <th style={{ width: "200px" }}>Topic</th>
                                    <th>Payload</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={3} style={{ textAlign: "center", padding: "2rem" }}>
                                            No audit log entries found.
                                        </td>
                                    </tr>
                                ) : (
                                    entries.map((entry) => (
                                        <tr key={entry.identifier}>
                                            <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                                                {formatTimestamp(entry.createdAt)}
                                            </td>
                                            <td>
                                                <code style={{ fontSize: "0.8rem" }}>{entry.topic}</code>
                                            </td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="sidebar-group-chevron"
                                                    style={{ fontSize: "0.8rem", cursor: "pointer", border: "none", background: "none", padding: 0, marginRight: "0.3rem" }}
                                                    onClick={() =>
                                                        setExpandedPayload(
                                                            expandedPayload === entry.identifier
                                                                ? null
                                                                : entry.identifier,
                                                        )
                                                    }
                                                >
                                                    {expandedPayload === entry.identifier ? "▾" : "▸"}
                                                </button>
                                                <span style={{ fontSize: "0.8rem", color: "var(--text-muted, #666)" }}>
                                                    {expandedPayload === entry.identifier
                                                        ? formatPayload(entry.payload)
                                                        : `${JSON.stringify(entry.payload).slice(0, 80)}${JSON.stringify(entry.payload).length > 80 ? "..." : ""}`}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>

                        {total > 0 ? (
                            <div className="admin-pager-row">
                                <button type="button" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}>
                                    Previous
                                </button>
                                <span>
                                    Page {page + 1} of {totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={page >= totalPages - 1}
                                    onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                                >
                                    Next
                                </button>
                                <span>{total} entries</span>
                            </div>
                        ) : null}
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
