import { useCallback, useEffect, useState } from "react";
import { PageSection, PageTemplate } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { FP_MANAGE_DATA_TYPES } from "@/ui/auth/functional_permissions.ts";
import { getScriptLogs, clearScriptLog, type ScriptLogEntry } from "@/ui/api/ScriptLog.ts";
import { apiGet } from "@/ui/api/index.ts";
import { MultiSelect } from "primereact/multiselect";
import { InputText } from "primereact/inputtext";

type ViewerContext = { permissionNames: string[] };

export const meta: PageMeta = {
    id: "admin-script-log",
    urn: "urn:bun-starter:ui:page:admin-script-log",
    path: "/admin/script-log",
    title: "Script Log",
    description: "View and filter log messages produced by stored scripts via ctx.api.log().",
    menu: {
        section: "Configuration",
        order: 95,
        label: "Script Log",
        parent: "configuration-home",
    },
    requiredFunctionalPermissions: [FP_MANAGE_DATA_TYPES.functionalPermissionName],
};

const PAGE_SIZE = 50;

const LOG_LEVELS = [
    { label: "Debug", value: "debug" },
    { label: "Info", value: "info" },
    { label: "Warn", value: "warn" },
    { label: "Error", value: "error" },
];

const SCRIPT_CATEGORIES = [
    { label: "Calculation", value: "calculation" },
    { label: "Default Provider", value: "defaultProvider" },
    { label: "Filter", value: "filter" },
    { label: "Validate", value: "validate" },
    { label: "Mandatory Script", value: "mandatory_script" },
    { label: "Requestor Can Edit", value: "requestorCanEdit_script" },
];

function formatTimestamp(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

function logLevelBadge(level: string): { bg: string; fg: string } {
    switch (level) {
        case "debug": return { bg: "#e0e0e0", fg: "#333" };
        case "info": return { bg: "#bbdefb", fg: "#0d47a1" };
        case "warn": return { bg: "#fff9c4", fg: "#f57f17" };
        case "error": return { bg: "#ffcdd2", fg: "#b71c1c" };
        default: return { bg: "#f5f5f5", fg: "#333" };
    }
}

export function Component() {
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [entries, setEntries] = useState<ScriptLogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedLogLevels, setSelectedLogLevels] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [dataTypeFilter, setDataTypeFilter] = useState("");

    const [appliedLogLevels, setAppliedLogLevels] = useState<string[]>([]);
    const [appliedCategories, setAppliedCategories] = useState<string[]>([]);
    const [appliedDataType, setAppliedDataType] = useState("");

    const [isClearing, setIsClearing] = useState(false);
    const [confirmClear, setConfirmClear] = useState(false);

    const applyFilters = useCallback(() => {
        setAppliedLogLevels([...selectedLogLevels]);
        setAppliedCategories([...selectedCategories]);
        setAppliedDataType(dataTypeFilter.trim());
        setPage(0);
    }, [selectedLogLevels, selectedCategories, dataTypeFilter]);

    const hasActiveFilters = appliedLogLevels.length > 0 || appliedCategories.length > 0 || appliedDataType !== "";

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [context, payload] = await Promise.all([
                apiGet<ViewerContext>("/api/me/context"),
                getScriptLogs(
                    {
                        logLevel: appliedLogLevels.length > 0 ? appliedLogLevels.join(",") : undefined,
                        scriptCategory: appliedCategories.length > 0 ? appliedCategories.join(",") : undefined,
                        dataTypeIdentifier: appliedDataType || undefined,
                    },
                    page,
                    PAGE_SIZE,
                ),
            ]);
            setViewerContext(context);
            setEntries(payload.rows);
            setTotal(payload.total);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not load script log");
        } finally {
            setIsLoading(false);
        }
    }, [page, appliedLogLevels, appliedCategories, appliedDataType]);

    useEffect(() => {
        void load();
    }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    const handleClear = async () => {
        setIsClearing(true);
        setError(null);
        try {
            await clearScriptLog();
            setConfirmClear(false);
            setPage(0);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not clear script log");
        } finally {
            setIsClearing(false);
        }
    };

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Log Entries">
                {error ? <p className="admin-config-error">{error}</p> : null}

                <div className="admin-config-actions" style={{ marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", minWidth: "200px" }}>
                        Log Level
                        <MultiSelect
                            value={selectedLogLevels}
                            onChange={(e) => setSelectedLogLevels(e.value)}
                            options={LOG_LEVELS}
                            optionLabel="label"
                            placeholder="All levels"
                            style={{ fontSize: "0.875rem" }}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem", minWidth: "220px" }}>
                        Script Category
                        <MultiSelect
                            value={selectedCategories}
                            onChange={(e) => setSelectedCategories(e.value)}
                            options={SCRIPT_CATEGORIES}
                            optionLabel="label"
                            placeholder="All categories"
                            style={{ fontSize: "0.875rem" }}
                        />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", fontSize: "0.875rem" }}>
                        Data Type
                        <InputText
                            value={dataTypeFilter}
                            onChange={(e) => setDataTypeFilter(e.target.value)}
                            placeholder="UUID..."
                            style={{ width: "220px" }}
                            onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                        />
                    </label>
                    <button type="button" onClick={applyFilters}>Apply Filters</button>
                    {hasActiveFilters ? (
                        <button
                            type="button"
                            onClick={() => {
                                setSelectedLogLevels([]);
                                setSelectedCategories([]);
                                setDataTypeFilter("");
                                setAppliedLogLevels([]);
                                setAppliedCategories([]);
                                setAppliedDataType("");
                                setPage(0);
                            }}
                        >
                            Clear Filters
                        </button>
                    ) : null}
                    <span style={{ flex: 1 }} />
                    {confirmClear ? (
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
                            Clear Script Log
                        </button>
                    )}
                </div>

                {isLoading ? (
                    <p>Loading script log...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th style={{ width: "180px" }}>Timestamp</th>
                                    <th style={{ width: "80px" }}>Level</th>
                                    <th style={{ width: "150px" }}>Category</th>
                                    <th>Message</th>
                                    <th style={{ width: "130px" }}>Data Type</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                                            No script log entries found.
                                        </td>
                                    </tr>
                                ) : (
                                    entries.map((entry) => {
                                        const badge = logLevelBadge(entry.logLevel);
                                        return (
                                            <tr key={entry.identifier}>
                                                <td style={{ whiteSpace: "nowrap", fontSize: "0.8rem" }}>
                                                    {formatTimestamp(entry.createdAt)}
                                                </td>
                                                <td>
                                                    <span
                                                        style={{
                                                            display: "inline-block",
                                                            padding: "1px 6px",
                                                            borderRadius: "4px",
                                                            fontSize: "0.75rem",
                                                            fontWeight: "bold",
                                                            backgroundColor: badge.bg,
                                                            color: badge.fg,
                                                            textTransform: "uppercase",
                                                        }}
                                                    >
                                                        {entry.logLevel}
                                                    </span>
                                                </td>
                                                <td>
                                                    <code style={{ fontSize: "0.8rem" }}>{entry.scriptCategory}</code>
                                                </td>
                                                <td style={{ fontSize: "0.85rem", wordBreak: "break-word" }}>
                                                    {entry.message}
                                                </td>
                                                <td style={{ fontSize: "0.75rem", fontFamily: "monospace" }}>
                                                    {entry.dataTypeIdentifier
                                                        ? `${entry.dataTypeIdentifier.slice(0, 8)}...`
                                                        : "-"}
                                                </td>
                                            </tr>
                                        );
                                    })
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
