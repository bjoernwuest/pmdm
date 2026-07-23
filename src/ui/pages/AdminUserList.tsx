import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "./PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import type { UsersResponse } from "@/types/ApiType.ts";
import { FP_READ_USERS } from "@/ui/auth/functional_permissions.ts";
import { subscribe } from "@/ui/pubsub";
import { TAG_USER, TAG_UPDATE, TAG_DISABLE } from "@/types/PubSubType";

export const meta: PageMeta = {
    id: "admin-users",
    urn: "urn:bun-starter:ui:page:admin-users",
    path: "/admin/users",
    title: "Users",
    description: "Read-only user list and details.",
    menu: {
        section: "Administration",
        order: 10,
        label: "Users",
        parent: "admin-home",
    },
    requiredFunctionalPermissions: [FP_READ_USERS.functionalPermissionName],
};

export function Component() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const [users, setUsers] = useState<UsersResponse["users"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const queryPage = Number(searchParams.get("page") ?? "1");
    const queryPageSize = Number(searchParams.get("pageSize") ?? "10");
    const showDisabledUsers = searchParams.get("showDisabled") === "1";
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
    interface UserLabelRefs {
        firstName: React.RefObject<LabelHandle | null>;
        lastName: React.RefObject<LabelHandle | null>;
        email: React.RefObject<LabelHandle | null>;
        status: React.RefObject<LabelHandle | null>;
        updated: React.RefObject<LabelHandle | null>;
    }
    const labelRefs = useRef<Map<string, UserLabelRefs>>(new Map());

    // Seed Labels with initial text after users load
    useEffect(() => {
        users.forEach((user) => {
            const refs = labelRefs.current.get(user.identifier);
            if (refs) {
                refs.firstName.current?.setText(user.firstName, { userId: user.identifier, field: "firstName" });
                refs.lastName.current?.setText(user.lastName, { userId: user.identifier, field: "lastName" });
                refs.email.current?.setText(user.email, { userId: user.identifier, field: "email" });
                refs.status.current?.setText(user.disabled ? "Disabled" : "Enabled", { userId: user.identifier, field: "status" });
                refs.updated.current?.setText(new Date(user.updatedAt).toLocaleString(), { userId: user.identifier, field: "updated" });
            }
        });
    }, [users]);

    // PubSub subscription for live updates
    useEffect(() => {
        const token = subscribe(
            { or: [TAG_UPDATE, TAG_DISABLE] },
            (msg) => {
                const tags = msg.tags;
                // Find the user identifier in the tags (it's a UUID)
                const userId = tags.find((t) => /^[0-9a-f-]{36}$/i.test(t));
                if (!userId) return;
                const refs = labelRefs.current.get(userId);
                if (!refs) return;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.firstName !== undefined) refs.firstName.current?.setText(String(data.firstName), { userId, field: "firstName" });
                    if (data?.lastName !== undefined) refs.lastName.current?.setText(String(data.lastName), { userId, field: "lastName" });
                    if (data?.email !== undefined) refs.email.current?.setText(String(data.email), { userId, field: "email" });
                    if (data?.updatedAt !== undefined) refs.updated.current?.setText(new Date(String(data.updatedAt)).toLocaleString(), { userId, field: "updated" });
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    refs.status.current?.setText(disabled ? "Disabled" : "Enabled", { userId, field: "status" });
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
            const setLoading = page === 1 && users.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const includeInactiveParam = showDisabledUsers ? "&includeInactive=true" : "";
                const payload = await apiGet<UsersResponse>(`/api/users?page=${page - 1}&pageSize=${pageSize}${includeInactiveParam}`);
                if (!cancelled) {
                    setUsers(payload.users);
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
            <PageSection title="User list">
                <div className="admin-toggle-row">
                    <span>Show disabled users</span>
                    <Toggle<boolean>
                        variant="toggle"
                        value={showDisabledUsers}
                        options={[{ value: true, label: "Show disabled users" }, { value: false, label: "Hide disabled users" }]}
                        onChange={(t) => updateQuery({ showDisabled: t.getValue(), page: 1 })}
                    />
                </div>

                {isLoading || isPageLoading ? (
                    <p>Loading users...</p>
                ) : (
                    <>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th>First name</th>
                                    <th>Last name</th>
                                    <th>Email</th>
                                    <th>Status</th>
                                    <th>Technical identifier</th>
                                    <th>Created</th>
                                    <th>Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map((user) => {
                                    if (!labelRefs.current.has(user.identifier)) {
                                        labelRefs.current.set(user.identifier, {
                                            firstName: { current: null },
                                            lastName: { current: null },
                                            email: { current: null },
                                            status: { current: null },
                                            updated: { current: null },
                                        });
                                    }
                                    const refs = labelRefs.current.get(user.identifier)!;
                                    return (
                                        <tr
                                            key={user.identifier}
                                            className="admin-clickable-row"
                                            onClick={() => navigate(`/admin/users/${encodeURIComponent(user.identifier)}${location.search}`)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter" || event.key === " ") {
                                                    event.preventDefault();
                                                    navigate(`/admin/users/${encodeURIComponent(user.identifier)}${location.search}`);
                                                }
                                            }}
                                            tabIndex={0}
                                            role="button"
                                        >
                                            <td><Label ref={refs.firstName} text={user.firstName} size="small" /></td>
                                            <td><Label ref={refs.lastName} text={user.lastName} size="small" /></td>
                                            <td><Label ref={refs.email} text={user.email} size="small" /></td>
                                            <td><Label ref={refs.status} text={user.disabled ? "Disabled" : "Enabled"} size="small" /></td>
                                            <td><code>{user.identifier}</code></td>
                                            <td>{new Date(user.createdAt).toLocaleString()}</td>
                                            <td><Label ref={refs.updated} text={new Date(user.updatedAt).toLocaleString()} size="small" /></td>
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
                            <span>{total} users</span>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
