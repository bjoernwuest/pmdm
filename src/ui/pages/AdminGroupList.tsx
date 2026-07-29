import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import type { GroupsResponse } from "@/types/ApiType.ts";
import { FP_READ_GROUPS } from "@/ui/auth/functional_permissions.ts";
import { subscribe } from "@/ui/pubsub";
import { TAG_GROUP, TAG_UPDATE, TAG_DISABLE } from "@/types/PubSubType";

export const meta: PageMeta = {
    id: "admin-groups",
    urn: "urn:bun-starter:ui:page:admin-groups",
    path: "/admin/groups",
    title: "Groups",
    description: "Read-only group list and details.",
    menu: {
        section: "Administration",
        order: 20,
        label: "Groups",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_READ_GROUPS.functionalPermissionName],
};

export function Component() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [groups, setGroups] = useState<GroupsResponse["groups"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabledGroups = searchParams.get("showDisabled") === "1";
    const page = Number.isInteger(queryPage) && queryPage > 0 ? queryPage : 1;
    const pageSize = Number.isInteger(queryPageSize) && queryPageSize > 0 ? queryPageSize : 10;
    const [availablePageSizes, setAvailablePageSizes] = useState<number[]>([10, 20, 50]);
    const [total, setTotal] = useState(0);

    const updateQuery = (patch: { page?: number; pageSize?: number; showDisabled?: boolean }) => {
        const next = new URLSearchParams(searchParams);
        if (patch.page !== undefined) next.set("page", String(patch.page));
        if (patch.pageSize !== undefined) next.set("pageSize", String(patch.pageSize));
        if (patch.showDisabled !== undefined) {
            if (patch.showDisabled) next.set("showDisabled", "1");
            else next.delete("showDisabled");
        }
        setSearchParams(next);
    };

    // --- Label refs for pubsub-driven updates ---
    interface GroupLabelRefs {
        name: React.RefObject<LabelHandle | null>;
        status: React.RefObject<LabelHandle | null>;
        updated: React.RefObject<LabelHandle | null>;
    }
    const labelRefs = useRef<Map<string, GroupLabelRefs>>(new Map());

    // Seed Labels with initial text after groups load
    useEffect(() => {
        groups.forEach((group) => {
            const refs = labelRefs.current.get(group.identifier);
            if (refs) {
                refs.name.current?.setText(group.groupName, { groupId: group.identifier, field: "name" });
                refs.status.current?.setText(group.disabled ? "Disabled" : "Enabled", { groupId: group.identifier, field: "status" });
                refs.updated.current?.setText(new Date(group.updatedAt).toLocaleString(), { groupId: group.identifier, field: "updated" });
            }
        });
    }, [groups]);

    // PubSub subscription for live updates
    useEffect(() => {
        const token = subscribe(
            { or: [TAG_UPDATE, TAG_DISABLE] },
            (msg) => {
                const tags = msg.tags;
                const groupId = tags.find((t) => /^[0-9a-f-]{36}$/i.test(t));
                if (!groupId) return;
                const refs = labelRefs.current.get(groupId);
                if (!refs) return;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.groupName !== undefined) refs.name.current?.setText(String(data.groupName), { groupId, field: "name" });
                    if (data?.updatedAt !== undefined) refs.updated.current?.setText(new Date(String(data.updatedAt)).toLocaleString(), { groupId, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    refs.status.current?.setText(disabled ? "Disabled" : "Enabled", { groupId, field: "status" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const setLoading = page === 1 && groups.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const includeInactiveParam = showDisabledGroups ? "&includeInactive=true" : "";
                const payload = await apiGet<GroupsResponse>(`/api/groups?page=${page - 1}&pageSize=${pageSize}${includeInactiveParam}`);
                if (!cancelled) {
                    setGroups(payload.groups);
                    if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
                    setTotal(payload.total);
                    setAvailablePageSizes(payload.availablePageSizes);
                    if (!payload.availablePageSizes.includes(pageSize) && payload.availablePageSizes.length > 0) {
                        updateQuery({ page: 1, pageSize: payload.availablePageSizes[0]! });
                    }
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                    setIsPageLoading(false);
                }
            }
        };
        void load();
        return () => {
            cancelled = true;
        };
    }, [page, pageSize, searchParams.toString()]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Group list">
                <div className="admin-toggle-row">
                    <span>Show disabled groups</span>
                    <Toggle<boolean>
                        variant="toggle"
                        value={showDisabledGroups}
                        options={[{ value: true, label: "Show disabled groups" }, { value: false, label: "Hide disabled groups" }]}
                        onChange={(t) => updateQuery({ showDisabled: t.getValue(), page: 1 })}
                    />
                </div>

                {isLoading || isPageLoading ? (
                    <p>Loading groups...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Status</th>
                                    <th>Technical identifier</th>
                                    <th>Created</th>
                                    <th>Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groups.map((group) => {
                                    if (!labelRefs.current.has(group.identifier)) {
                                        labelRefs.current.set(group.identifier, {
                                            name: { current: null },
                                            status: { current: null },
                                            updated: { current: null },
                                        });
                                    }
                                    const refs = labelRefs.current.get(group.identifier)!;
                                    return (
                                        <tr
                                            key={group.identifier}
                                            className="admin-clickable-row"
                                            onClick={() => navigate(`/admin/groups/${encodeURIComponent(group.identifier)}${location.search}`)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    navigate(`/admin/groups/${encodeURIComponent(group.identifier)}${location.search}`);
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                        >
                                            <td><Label ref={refs.name} text={group.groupName} size="small" /></td>
                                            <td><Label ref={refs.status} text={group.disabled ? "Disabled" : "Enabled"} size="small" /></td>
                                            <td><code>{group.identifier}</code></td>
                                            <td>{new Date(group.createdAt).toLocaleString()}</td>
                                            <td><Label ref={refs.updated} text={new Date(group.updatedAt).toLocaleString()} size="small" /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        <div className="admin-pager-row">
                            <button type="button" disabled={page <= 1} onClick={() => updateQuery({ page: Math.max(1, page - 1) })}>
                                Previous
                            </button>
                            <span>Page {page} of {totalPages}</span>
                            <button type="button" disabled={page >= totalPages} onClick={() => updateQuery({ page: Math.min(totalPages, page + 1) })}>
                                Next
                            </button>
                            <label>
                                Page size
                                <select
                                    className="admin-page-size"
                                    value={pageSize}
                                    onChange={(event) => {
                                        updateQuery({ page: 1, pageSize: Number(event.target.value) });
                                    }}
                                >
                                    {availablePageSizes.map((size) => (
                                        <option key={size} value={size}>{size}</option>
                                    ))}
                                </select>
                            </label>
                            <span>{total} groups</span>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}

