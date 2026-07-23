import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { InputSwitch } from "primereact/inputswitch";
import Toggle from "@/ui/components/Toggle";
import { PageTemplate, PageSection } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiDelete, apiGet, apiPost } from "@/ui/api/index.ts";
import type { FunctionalPermissionDetailResponseType, GroupsResponse } from "@/types/ApiType.ts";
import {
    FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS,
    FP_READ_FUNCTIONAL_PERMISSIONS,
    FP_READ_GROUPS
} from "@/ui/auth/functional_permissions.ts";
import type {GroupSelectType} from "@/types/UserType.ts";

export const meta: PageMeta = {
    id: "admin-functional-permission-detail",
    urn: "urn:bun-starter:ui:page:admin-functional-permission-detail",
    path: "/admin/functional-permissions/:functionalpermissionid",
    title: "Functional permission details",
    description: "Read-only functional permission details.",
    menu: {
        section: "Administration",
        order: 31,
        label: "Functional permission details",
        parent: "admin-functional-permissions",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_READ_FUNCTIONAL_PERMISSIONS.functionalPermissionName],
};

type ViewerContext = { permissionNames: string[] };

export function Component() {
    const { functionalpermissionid } = useParams();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [viewerContext, setViewerContext] = useState<ViewerContext>({ permissionNames: [] });
    const [detailPayload, setDetailPayload] = useState<FunctionalPermissionDetailResponseType | null>(null);
    const [allGroups, setAllGroups] = useState<GroupSelectType[]>([]);
    const [groupsTotal, setGroupsTotal] = useState(0);
    const [groupsAvailablePageSizes, setGroupsAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [showDisabledGroups, setShowDisabledGroups] = useState(() => searchParams.get("showDisabledGroups") === "1");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    const queryGroupsPage = Number(searchParams.get("groupsPage") ?? "1");
    const queryGroupsPageSize = Number(searchParams.get("groupsPageSize") ?? "10");
    const groupsPage = Number.isInteger(queryGroupsPage) && queryGroupsPage > 0 ? queryGroupsPage : 1;
    const groupsPageSize = Number.isInteger(queryGroupsPageSize) && queryGroupsPageSize > 0 ? queryGroupsPageSize : 10;

    const updateQuery = (patch: { groupsPage?: number; groupsPageSize?: number; showDisabledGroups?: boolean }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.groupsPage !== undefined) next.set("groupsPage", String(patch.groupsPage));
        if (patch.groupsPageSize !== undefined) next.set("groupsPageSize", String(patch.groupsPageSize));
        if (patch.showDisabledGroups !== undefined) {
            if (patch.showDisabledGroups) next.set("showDisabledGroups", "1");
            else next.delete("showDisabledGroups");
        }
        setSearchParams(next);
    };

    useEffect(() => {
        let cancelled = false;
        if (!functionalpermissionid) return;

        setIsLoading(true);
        void Promise.all([
            apiGet<ViewerContext>("/api/me/context"),
            apiGet<FunctionalPermissionDetailResponseType>(`/api/functionalpermissions/${encodeURIComponent(functionalpermissionid)}`),
            apiGet<GroupsResponse>(`/api/groups?page=${groupsPage - 1}&pageSize=${groupsPageSize}&includeInactive=${showDisabledGroups}`),
        ]).then(([context, details, groupsResp]) => {
            if (cancelled) return;
            setViewerContext(context);
            setDetailPayload(details);
            setAllGroups(groupsResp.groups);
            setGroupsTotal(groupsResp.total);
            setGroupsAvailablePageSizes(groupsResp.availablePageSizes);
            if (groupsResp.page !== groupsPage - 1) updateQuery({ groupsPage: groupsResp.page + 1 });
            if (!groupsResp.availablePageSizes.includes(groupsPageSize) && groupsResp.availablePageSizes.length > 0) {
                updateQuery({ groupsPage: 1, groupsPageSize: groupsResp.availablePageSizes[0]! });
            }
        }).finally(() => {
            if (!cancelled) setIsLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [functionalpermissionid, groupsPage, groupsPageSize, searchParams.toString()]);

    const canEditAssignments = viewerContext.permissionNames.includes(FP_READ_GROUPS.functionalPermissionName)
        && viewerContext.permissionNames.includes(FP_EDIT_FUNCTIONAL_PERMISSION_ASSIGNMENTS.functionalPermissionName);

    const assignedGroupIds = useMemo(
        () => (detailPayload?.grantedToGroups ?? []).map((g: GroupSelectType) => g.identifier),
        [detailPayload],
    );

    const refreshDetail = async () => {
        if (!functionalpermissionid) return;
        const refreshed = await apiGet<FunctionalPermissionDetailResponseType>(
            `/api/functionalpermissions/${encodeURIComponent(functionalpermissionid)}`,
        );
        setDetailPayload(refreshed);
    };

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Functional permission details">
                {isLoading || !detailPayload ? (
                    <p>Loading functional permission details...</p>
                ) : (
                    <>
                        <div className="admin-detail-grid">
                            <div><strong>Name:</strong> {detailPayload.functionalPermission.functionalPermissionName}</div>
                            <div><strong>Group:</strong> {detailPayload.functionalPermission.group}</div>
                            <div><strong>Description:</strong> {detailPayload.functionalPermission.description}</div>
                            <div><strong>Technical identifier:</strong> <code>{detailPayload.functionalPermission.identifier}</code></div>
                            <div><strong>Created:</strong> {new Date(detailPayload.functionalPermission.createdAt).toLocaleString()}</div>
                            <div><strong>Updated:</strong> {new Date(detailPayload.functionalPermission.updatedAt).toLocaleString()}</div>
                        </div>

                        {canEditAssignments ? (
                            <div className="admin-top-gap">
                                <div className="admin-toggle-row">
                                    <span>Show disabled groups</span>
                                    <InputSwitch
                                        checked={showDisabledGroups}
                                        onChange={(event) => {
                                            const checked = Boolean(event.value);
                                            setShowDisabledGroups(checked);
                                            updateQuery({ showDisabledGroups: checked, groupsPage: 1 });
                                        }}
                                    />
                                </div>

                                <h3>Group assignments</h3>
                                <p className="small-muted">Changes are saved immediately.</p>
                                <table className="mui-simple-table admin-table">
                                    <thead>
                                        <tr>
                                            <th>Assigned</th>
                                            <th>Group</th>
                                            <th>Status</th>
                                            <th>Technical identifier</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allGroups.map((group) => {
                                            const isChecked = assignedGroupIds.includes(group.identifier);
                                            return (
                                                <tr key={group.identifier}>
                                                    <td>
                                                        <Toggle<boolean>
                                                            variant="checkbox"
                                                            value={isChecked}
                                                            options={[{ value: true, label: "Yes" }, { value: false, label: "No" }]}
                                                            disabled={isSaving}
                                                            onChange={async (t) => {
                                                                if (!functionalpermissionid) return;
                                                                setIsSaving(true);
                                                                try {
                                                                    if (t.getValue()) {
                                                                        await apiPost(
                                                                            `/api/functionalpermissions/${encodeURIComponent(functionalpermissionid)}/groups`,
                                                                            { groupIdentifiers: [group.identifier] },
                                                                        );
                                                                    } else {
                                                                        await apiDelete(
                                                                            `/api/functionalpermissions/${encodeURIComponent(functionalpermissionid)}/groups`,
                                                                            { groupIdentifiers: [group.identifier] },
                                                                        );
                                                                    }
                                                                    await refreshDetail();
                                                                } finally {
                                                                    setIsSaving(false);
                                                                }
                                                            }}
                                                        />
                                                    </td>
                                                    <td>{group.groupName}</td>
                                                    <td>{group.disabled ? "Disabled" : "Enabled"}</td>
                                                    <td><code>{group.identifier}</code></td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className="admin-pager-row">
                                    <button type="button" disabled={groupsPage <= 1} onClick={() => updateQuery({ groupsPage: Math.max(1, groupsPage - 1) })}>
                                        Previous
                                    </button>
                                    <span>Page {groupsPage} of {Math.max(1, Math.ceil(groupsTotal / groupsPageSize))}</span>
                                    <button type="button" disabled={groupsPage >= Math.max(1, Math.ceil(groupsTotal / groupsPageSize))} onClick={() => updateQuery({ groupsPage: Math.min(Math.max(1, Math.ceil(groupsTotal / groupsPageSize)), groupsPage + 1) })}>
                                        Next
                                    </button>
                                    <label>
                                        Page size
                                        <select
                                            className="admin-page-size"
                                            value={groupsPageSize}
                                            onChange={(event) => updateQuery({ groupsPage: 1, groupsPageSize: Number(event.target.value) })}
                                        >
                                            {groupsAvailablePageSizes.map((size) => (
                                                <option key={size} value={size}>{size}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <span>{groupsTotal} groups</span>
                                </div>
                            </div>
                        ) : null}

                        <div className="admin-top-gap">
                            <Link to={`/admin/functional-permissions${location.search}`}>Back to functional permission list</Link>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
