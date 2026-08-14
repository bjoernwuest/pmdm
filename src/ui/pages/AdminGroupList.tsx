import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { getGroups } from "@/ui/api/Groups.ts";
import type { GroupsResponse } from "@/types/ApiType.ts";
import { FP_READ_GROUPS } from "@/ui/auth/functional_permissions.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub";
import { useAdminListQuery } from "@/ui/useAdminListQuery.ts";
import { AdminPager } from "@/ui/AdminPager.tsx";
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
    const [groups, setGroups] = useState<GroupsResponse["groups"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const {
        page,
        pageSize,
        showDisabled: showDisabledGroups,
        availablePageSizes,
        total,
        setAvailablePageSizes,
        setTotal,
        updateQuery,
    } = useAdminListQuery();

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
            { and: [TAG_GROUP, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Entity identifier comes from the payload (instance-form convention), not from a tag regex.
                const rawGroupId = data?.identifier ?? (data?.identifiers as Record<string, unknown> | undefined)?.group;
                const groupId = typeof rawGroupId === "string" ? rawGroupId : undefined;
                if (!groupId) return;
                const refs = labelRefs.current.get(groupId);
                if (!refs) return;

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
                unsubscribe(token);
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const setLoading = page === 1 && groups.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const payload = await getGroups(page - 1, pageSize, showDisabledGroups);
                if (!cancelled) {
                    setGroups(payload.groups);
                    if (payload.page !== page - 1) updateQuery({ page: payload.page + 1 });
                    setTotal(payload.total);
                    setAvailablePageSizes(payload.availablePageSizes);
                    if (!payload.availablePageSizes.includes(pageSize)) {
                        const [firstPageSize] = payload.availablePageSizes;
                        if (typeof firstPageSize === "number") {
                            updateQuery({ page: 1, pageSize: firstPageSize });
                        }
                    }
                }
            } catch (err) {
                if (!cancelled) setError(err instanceof Error ? err.message : "Could not load groups");
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
    }, [page, pageSize, showDisabledGroups]);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="Group list">
                {error ? <p className="admin-config-error">{error}</p> : null}
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
                                {groups.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: "center", padding: "2rem" }}>
                                            No groups found.
                                        </td>
                                    </tr>
                                ) : (groups.map((group) => {
                                    let refs = labelRefs.current.get(group.identifier);
                                    if (!refs) {
                                        refs = {
                                            name: { current: null },
                                            status: { current: null },
                                            updated: { current: null },
                                        };
                                        labelRefs.current.set(group.identifier, refs);
                                    }
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
                                }))}
                            </tbody>
                        </table>
                        <AdminPager
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            availablePageSizes={availablePageSizes}
                            onUpdate={updateQuery}
                            entityLabel="groups"
                        />
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}

