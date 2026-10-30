import { useEffect, useMemo, useState } from "react";
import { Column } from "primereact/column";
import { DataTable } from "primereact/datatable";
import { Message } from "primereact/message";
import { Tag } from "primereact/tag";
import { PageSection, PageTemplate } from "@/ui/PageTemplate.tsx";
import { getMyEffectivePermissions } from "@/ui/api/session.ts";
import type { PageMeta } from "@/types/PageType.ts";
import type { FunctionalPermissionSelectType } from "@/types/FunctionalPermissionType.ts";
import type {
    EffectiveDataTypePermission,
    EffectivePermissionRole,
    EffectivePermissionsResponse,
    EffectiveProductTypePermission,
} from "@/types/EffectivePermissionsType.ts";

export const meta: PageMeta = {
    id: "effective-permissions",
    urn: "urn:pmdm:ui:page:effective-permissions",
    path: "/my-permissions",
    title: "My Effective Permissions",
    description: "Functional permissions and product-type capabilities for your account.",
    menu: {
        section: "User",
        order: 100,
        label: "My Permissions",
    },
};

const FUNCTIONAL_PERMISSION_GROUP_ORDER = ["System", "Admin", "Configuration", "General"];
const CALCULATED_DATA_TYPE_KIND = "calculated";

function groupRank(group: string): number {
    const index = FUNCTIONAL_PERMISSION_GROUP_ORDER.indexOf(group);
    return index === -1 ? FUNCTIONAL_PERMISSION_GROUP_ORDER.length : index;
}

function groupFunctionalPermissions(
    permissions: readonly FunctionalPermissionSelectType[],
): [string, FunctionalPermissionSelectType[]][] {
    const groups = new Map<string, FunctionalPermissionSelectType[]>();
    for (const permission of permissions) {
        const group = permission.group || "General";
        const entries = groups.get(group) ?? [];
        entries.push(permission);
        groups.set(group, entries);
    }

    return [...groups.entries()]
        .sort(([a], [b]) => groupRank(a) - groupRank(b) || a.localeCompare(b))
        .map(([group, entries]) => [
            group,
            [...entries].sort((a, b) => a.functionalPermissionName.localeCompare(b.functionalPermissionName)),
        ]);
}

function roleSeverity(role: EffectivePermissionRole): "info" | "warning" | "success" {
    switch (role) {
        case "writer":
            return "warning";
        case "approver":
            return "success";
        default:
            return "info";
    }
}

function rolesBody(dataType: EffectiveDataTypePermission) {
    if (dataType.roles.length === 0) {
        return <span className="small-muted">—</span>;
    }

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
            {dataType.roles.map((role) => (
                <Tag key={role} severity={roleSeverity(role)} value={role} />
            ))}
        </div>
    );
}

function capabilityBody(capable: boolean, notApplicable: boolean) {
    if (notApplicable) {
        return <span className="small-muted">n/a</span>;
    }

    return <Tag severity={capable ? "success" : "danger"} value={capable ? "Yes" : "No"} />;
}

function cancelStatus(productType: EffectiveProductTypePermission) {
    if (productType.cancelAllRequests) {
        return <Tag severity="danger" value="All requests" />;
    }
    if (productType.cancelOwnRequests) {
        return <Tag severity="warning" value="Own requests only" />;
    }
    return <Tag severity="secondary" value="No" />;
}

function dataTypeMatrix(productType: EffectiveProductTypePermission) {
    if (productType.dataTypes.length === 0) {
        return <Message severity="info" text="No data types are assigned to this product type." />;
    }

    return (
        <DataTable value={productType.dataTypes} dataKey="identifier" size="small" stripedRows>
            <Column
                header="Data type"
                body={(dataType: EffectiveDataTypePermission) => (
                    <div>
                        <div style={{ fontWeight: 600 }}>{dataType.name}</div>
                        <div className="small-muted" style={{ fontFamily: "monospace", fontSize: "0.7rem" }}>
                            {dataType.identifier}
                        </div>
                    </div>
                )}
            />
            <Column header="Kind" body={(dataType: EffectiveDataTypePermission) => <Tag value={dataType.kind} />} />
            <Column header="Roles" body={rolesBody} />
            <Column
                header="Read"
                body={(dataType: EffectiveDataTypePermission) => capabilityBody(dataType.canRead, false)}
            />
            <Column
                header="Write"
                body={(dataType: EffectiveDataTypePermission) =>
                    capabilityBody(dataType.canWrite, dataType.kind === CALCULATED_DATA_TYPE_KIND)}
            />
            <Column
                header="Approve"
                body={(dataType: EffectiveDataTypePermission) =>
                    capabilityBody(dataType.canApprove, dataType.kind === CALCULATED_DATA_TYPE_KIND)}
            />
        </DataTable>
    );
}

export function Component() {
    const [data, setData] = useState<EffectivePermissionsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let cancelled = false;

        void getMyEffectivePermissions()
            .then((response) => {
                if (!cancelled) setData(response);
            })
            .catch((e: unknown) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load effective permissions.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const functionalPermissionGroups = useMemo(
        () => groupFunctionalPermissions(data?.functionalPermissions ?? []),
        [data?.functionalPermissions],
    );

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            {error && <Message severity="error" text={error} />}
            {!error && loading && <div>Loading…</div>}

            {!error && !loading && data && (
                <>
                    <PageSection title="Functional permissions">
                        {functionalPermissionGroups.length === 0 ? (
                            <Message severity="info" text="No functional permissions are assigned to your account." />
                        ) : (
                            functionalPermissionGroups.map(([group, permissions]) => (
                                <div key={group} style={{ marginBottom: "1rem" }}>
                                    <h3 style={{ fontSize: "0.95rem", margin: "0 0 0.5rem" }}>{group}</h3>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                                        {permissions.map((permission) => (
                                            <div key={permission.identifier}>
                                                <code style={{ fontSize: "0.85rem" }}>{permission.functionalPermissionName}</code>
                                                <div className="small-muted">{permission.description}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </PageSection>

                    <PageSection title="Product type permissions">
                        <Message
                            severity="info"
                            text="The matrix shows role-based capabilities. Creator, update-request, previous-approval and mandatory-value rules are evaluated per request and may restrict an action further."
                        />

                        {data.productTypes.length === 0 ? (
                            <Message severity="info" text="No active product types are configured." />
                        ) : (
                            <DataTable
                                value={data.productTypes}
                                dataKey="identifier"
                                expandedRows={expandedRows}
                                onRowToggle={(event) =>
                                    setExpandedRows((event.data ?? {}) as Record<string, boolean>)}
                                rowExpansionTemplate={dataTypeMatrix}
                                size="small"
                                stripedRows
                            >
                                <Column
                                    header="Product type"
                                    body={(productType: EffectiveProductTypePermission) => (
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{productType.name}</div>
                                            {productType.description ? (
                                                <div className="small-muted">{productType.description}</div>
                                            ) : null}
                                        </div>
                                    )}
                                />
                                <Column header="Cancel" body={cancelStatus} />
                            </DataTable>
                        )}
                    </PageSection>
                </>
            )}
        </PageTemplate>
    );
}
