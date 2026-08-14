import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Toggle from "@/ui/components/Toggle";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { getUsers } from "@/ui/api/Users.ts";
import type { UsersResponse } from "@/types/ApiType.ts";
import { FP_READ_USERS } from "@/ui/auth/functional_permissions.ts";
import { subscribe, unsubscribe } from "@/ui/pubsub";
import { useAdminListQuery } from "@/ui/useAdminListQuery.ts";
import { AdminPager } from "@/ui/AdminPager.tsx";
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
    const [users, setUsers] = useState<UsersResponse["users"]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPageLoading, setIsPageLoading] = useState(false);
    const {
        page,
        pageSize,
        showDisabled: showDisabledUsers,
        availablePageSizes,
        total,
        setAvailablePageSizes,
        setTotal,
        updateQuery,
    } = useAdminListQuery();

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
                // Guarded re-seed: call setText only when the incoming value differs
                // from the component's current value (see the three-phase model in Label.tsx).
                if (refs.firstName.current && refs.firstName.current.getText() !== user.firstName) {
                    refs.firstName.current.setText(user.firstName, { userId: user.identifier, field: "firstName" });
                }
                if (refs.lastName.current && refs.lastName.current.getText() !== user.lastName) {
                    refs.lastName.current.setText(user.lastName, { userId: user.identifier, field: "lastName" });
                }
                if (refs.email.current && refs.email.current.getText() !== user.email) {
                    refs.email.current.setText(user.email, { userId: user.identifier, field: "email" });
                }
                const statusText = user.disabled ? "Disabled" : "Enabled";
                if (refs.status.current && refs.status.current.getText() !== statusText) {
                    refs.status.current.setText(statusText, { userId: user.identifier, field: "status" });
                }
                const updatedText = new Date(user.updatedAt).toLocaleString();
                if (refs.updated.current && refs.updated.current.getText() !== updatedText) {
                    refs.updated.current.setText(updatedText, { userId: user.identifier, field: "updated" });
                }
            }
        });
    }, [users]);

    // PubSub subscription for live updates
    useEffect(() => {
        const token = subscribe(
            { and: [TAG_USER, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;
                // Entity identifier comes from the payload (instance-form convention), not from a tag regex.
                const rawUserId = data?.identifier ?? (data?.identifiers as Record<string, unknown> | undefined)?.user;
                const userId = typeof rawUserId === "string" ? rawUserId : undefined;
                if (!userId) return;
                const refs = labelRefs.current.get(userId);
                if (!refs) return;

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
                unsubscribe(token);
            }
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            const setLoading = page === 1 && users.length === 0 ? setIsLoading : setIsPageLoading;
            setLoading(true);
            try {
                const payload = await getUsers(page - 1, pageSize, showDisabledUsers);
                if (!cancelled) {
                    setUsers(payload.users);
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
                if (!cancelled) setError(err instanceof Error ? err.message : "Could not load users");
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
    }, [page, pageSize, showDisabledUsers]);

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="User list">
                {error ? <p className="admin-config-error">{error}</p> : null}
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
                                {users.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: "center", padding: "2rem" }}>
                                            No users found.
                                        </td>
                                    </tr>
                                ) : (users.map((user) => {
                                    let refs = labelRefs.current.get(user.identifier);
                                    if (!refs) {
                                        refs = {
                                            firstName: { current: null },
                                            lastName: { current: null },
                                            email: { current: null },
                                            status: { current: null },
                                            updated: { current: null },
                                        };
                                        labelRefs.current.set(user.identifier, refs);
                                    }
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
                                }))}
                            </tbody>
                        </table>

                        <AdminPager
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            availablePageSizes={availablePageSizes}
                            onUpdate={updateQuery}
                            entityLabel="users"
                        />
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
