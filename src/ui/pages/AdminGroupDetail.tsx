import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiDelete, apiGet, apiPost } from "@/ui/api/index.ts";
import type { FunctionalPermissionsResponse, GroupFunctionalPermissionResponseType } from "@/types/ApiType.ts";
import {
    FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_READ_GROUPS
} from "@/ui/auth/functional_permissions.ts";
import type { FunctionalPermissionSelectType } from "@/types/FunctionalPermissionType.ts";
import { subscribe } from "@/ui/pubsub";
import {
    TAG_GROUP,
    TAG_FUNCTIONAL_PERMISSION,
    TAG_UPDATE,
    TAG_DISABLE,
    TAG_GRANT,
    TAG_REVOKE,
} from "@/types/PubSubType";


export const meta: PageMeta = {
    id: "admin-group-detail",
    urn: "urn:bun-starter:ui:page:admin-group-detail",
    path: "/admin/groups/:groupid",
    title: "Group details",
    description: "Read-only group details.",
    menu: {
        section: "Administration",
        order: 21,
        label: "Group details",
        parent: "admin-groups",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_READ_GROUPS.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

export function Component() {
    const { groupid } = useParams();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [groupPayload, setGroupPayload] = useState<GroupFunctionalPermissionResponseType | null>(null);
    const [assignedPermissions, setAssignedPermissions] = useState<FunctionalPermissionSelectType[]>([]);
    const [allPermissions, setAllPermissions] = useState<FunctionalPermissionSelectType[]>([]);
    const [permissionsTotal, setPermissionsTotal] = useState(0);
    const [permissionsAvailablePageSizes, setPermissionsAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Label refs for pubsub-driven updates
    const nameRef = useRef<LabelHandle>(null);
    const statusRef = useRef<LabelHandle>(null);
    const updatedRef = useRef<LabelHandle>(null);

    const queryPermissionsPage = Number(searchParams.get("permissionsPage") ?? "1");
    const queryPermissionsPageSize = Number(searchParams.get("permissionsPageSize") ?? "10");
    const permissionsPage = Number.isInteger(queryPermissionsPage) && queryPermissionsPage > 0 ? queryPermissionsPage : 1;
    const permissionsPageSize = Number.isInteger(queryPermissionsPageSize) && queryPermissionsPageSize > 0 ? queryPermissionsPageSize : 10;

    const updateQuery = (patch: { permissionsPage?: number; permissionsPageSize?: number }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.permissionsPage !== undefined) next.set("permissionsPage", String(patch.permissionsPage));
        if (patch.permissionsPageSize !== undefined) next.set("permissionsPageSize", String(patch.permissionsPageSize));
        setSearchParams(next);
    };

    const refreshAssigned = async () => {
        if (!groupid) return;
        const refreshed = await apiGet<FunctionalPermissionSelectType[]>(
            `/api/groups/${encodeURIComponent(groupid)}/functionalpermissions`,
        );
        setAssignedPermissions(refreshed);
    };

    useEffect(() => {
        let cancelled = false;
        if (!groupid) return;

        setIsLoading(true);
        void Promise.all([
            apiGet<ViewerContext>("/api/me/context"),
            apiGet<GroupFunctionalPermissionResponseType>(`/api/groups/${encodeURIComponent(groupid)}`),
            apiGet<FunctionalPermissionSelectType[]>(`/api/groups/${encodeURIComponent(groupid)}/functionalpermissions`),
            apiGet<FunctionalPermissionsResponse>(`/api/functionalpermissions?page=${permissionsPage - 1}&pageSize=${permissionsPageSize}`),
        ]).then(([context, group, assigned, all]) => {
            if (cancelled) return;
            setViewerContext(context);
            setGroupPayload(group);
            setAssignedPermissions(assigned);
            setAllPermissions(all.functionalPermissions);
            setPermissionsTotal(all.total);
            setPermissionsAvailablePageSizes(all.availablePageSizes);
            if (all.page !== permissionsPage - 1) updateQuery({ permissionsPage: all.page + 1 });
            if (!all.availablePageSizes.includes(permissionsPageSize) && all.availablePageSizes.length > 0) {
                updateQuery({ permissionsPage: 1, permissionsPageSize: all.availablePageSizes[0]! });
            }
            // Seed Labels with initial values
            const g = group.group;
            nameRef.current?.setText(g.groupName, { groupId: g.identifier, field: "name" });
            statusRef.current?.setText(g.disabled ? "Disabled" : "Enabled", { groupId: g.identifier, field: "status" });
            updatedRef.current?.setText(new Date(g.updatedAt).toLocaleString(), { groupId: g.identifier, field: "updated" });
        }).finally(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [groupid, permissionsPage, permissionsPageSize, searchParams.toString()]);

    // PubSub subscription for group label updates
    useEffect(() => {
        if (!groupid) return;
        const token = subscribe(
            { and: [TAG_GROUP, groupid, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.groupName !== undefined) nameRef.current?.setText(String(data.groupName), { groupId: groupid, field: "name" });
                    if (data?.updatedAt !== undefined) updatedRef.current?.setText(new Date(String(data.updatedAt)).toLocaleString(), { groupId: groupid, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusRef.current?.setText(disabled ? "Disabled" : "Enabled", { groupId: groupid, field: "status" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [groupid]);

    // Cross-subscription: refresh assigned permissions when granted/revoked from other pages
    useEffect(() => {
        if (!groupid) return;
        const token = subscribe(
            { and: [TAG_FUNCTIONAL_PERMISSION, groupid, { or: [TAG_GRANT, TAG_REVOKE] }] },
            () => {
                void refreshAssigned();
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [groupid]);

    const canReadFunctionalPermissions = viewerContext.permissionNames.includes(FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName);
    const canEditAssignments = canReadFunctionalPermissions
        && viewerContext.permissionNames.includes(FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName);

    const assignedIds = useMemo(
        () => assignedPermissions.map((p) => p.identifier),
        [assignedPermissions],
    );

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Group details">
                {isLoading || !groupPayload ? (
                    <p>Loading group details...</p>
                ) : (
                    <>
                        <div className="admin-detail-grid">
                            <div><strong>Name:</strong> <Label ref={nameRef} text={groupPayload.group.groupName} /></div>
                            <div><strong>Status:</strong> <Label ref={statusRef} text={groupPayload.group.disabled ? "Disabled" : "Enabled"} /></div>
                            <div><strong>Technical identifier:</strong> <code>{groupPayload.group.identifier}</code></div>
                            <div><strong>Created:</strong> {new Date(groupPayload.group.createdAt).toLocaleString()}</div>
                            <div><strong>Updated:</strong> <Label ref={updatedRef} text={new Date(groupPayload.group.updatedAt).toLocaleString()} /></div>
                        </div>


                        {canEditAssignments ? (
                            <div className="admin-top-gap">
                                <h3>Edit functional permission assignments</h3>
                                <p className="small-muted">Changes are saved immediately.</p>
                                <table className="mui-simple-table admin-table">
                                    <thead>
                                        <tr>
                                            <th>Assigned</th>
                                            <th>Functional permission</th>
                                            <th>Group</th>
                                            <th>Description</th>
                                            <th>Technical identifier</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allPermissions.map((permission) => {
                                            const isChecked = assignedIds.includes(permission.identifier);
                                            return (
                                                <tr key={permission.identifier}>
                                                    <td>
                                                        <Toggle<boolean>
                                                            variant="checkbox"
                                                            value={isChecked}
                                                            options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]}
                                                            disabled={isSaving}
                                                            onChange={async (t) => {
                                                                if (!groupid) return;
                                                                setIsSaving(true);
                                                                try {
                                                                    if (t.getValue()) {
                                                                        await apiPost(
                                                                            `/api/groups/${encodeURIComponent(groupid)}/functionalpermissions`,
                                                                            { permissionIdentifiers: [permission.identifier] },
                                                                        );
                                                                    } else {
                                                                        await apiDelete(
                                                                            `/api/groups/${encodeURIComponent(groupid)}/functionalpermissions`,
                                                                            { permissionIdentifiers: [permission.identifier] },
                                                                        );
                                                                    }
                                                                    await refreshAssigned();
                                                                } finally {
                                                                    setIsSaving(false);
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                    <td>{permission.functionalPermissionName}</td>
                                                    <td>{permission.group}</td>
                                                    <td>{permission.description}</td>
                                                    <td><code>{permission.identifier}</code></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className="admin-pager-row">
                                    <button type="button" disabled={permissionsPage <= 1} onClick={() => updateQuery({ permissionsPage: Math.max(1, permissionsPage - 1) })}>
                                        Previous
                                    </button>
                                    <span>Page {permissionsPage} of {Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize))}</span>
                                    <button type="button" disabled={permissionsPage >= Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize))} onClick={() => updateQuery({ permissionsPage: Math.min(Math.max(1, Math.ceil(permissionsTotal / permissionsPageSize)), permissionsPage + 1) })}>
                                        Next
                                    </button>
                                    <label>
                                        Page size
                                        <select
                                            className="admin-page-size"
                                            value={permissionsPageSize}
                                            onChange={(event) => updateQuery({ permissionsPage: 1, permissionsPageSize: Number(event.target.value) })}
                                        >
                                            {permissionsAvailablePageSizes.map((size) => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <span>{permissionsTotal} functional permissions</span>
                                </div>
                            </div>
                        ) : null}

                        <div className="admin-top-gap">
                            <Link to={`/admin/groups${location.search}`}>Back to group list</Link>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
