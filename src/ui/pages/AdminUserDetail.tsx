import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { InputSwitch } from "primereact/inputswitch";
import { Chip } from "primereact/chip";
import Label, { type LabelHandle } from "@/ui/components/Label";
import { PageTemplate, PageSection } from "@/ui/PageTemplate.tsx";
import type { PageMeta } from "@/types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import type { UserDetailsResponse } from "@/types/ApiType.ts";
import { FP_READ_USERS } from "@/ui/auth/functional_permissions.ts";
import { subscribe } from "@/ui/pubsub";
import { TAG_USER, TAG_UPDATE, TAG_DISABLE } from "@/types/PubSubType";

export const meta: PageMeta = {
    id: "admin-user-detail",
    urn: "urn:bun-starter:ui:page:admin-user-detail",
    path: "/admin/users/:userid",
    title: "User details",
    description: "Read-only user details.",
    menu: {
        section: "Administration",
        order: 11,
        label: "User details",
        parent: "admin-users",
        hidden: true,
    },
    requiredFunctionalPermissions: [FP_READ_USERS.functionalPermissionName],
};

export function Component() {
    const { userid } = useParams();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(true);
    const [showInactive, setShowInactive] = useState(false);
    const [payload, setPayload] = useState<UserDetailsResponse | null>(null);

    // Label refs for pubsub-driven updates
    const firstNameRef = useRef<LabelHandle>(null);
    const lastNameRef = useRef<LabelHandle>(null);
    const emailRef = useRef<LabelHandle>(null);
    const statusRef = useRef<LabelHandle>(null);
    const updatedRef = useRef<LabelHandle>(null);

    useEffect(() => {
        let cancelled = false;
        if (!userid) return;

        setIsLoading(true);
        void apiGet<UserDetailsResponse>(`/api/users/${encodeURIComponent(userid)}?includeInactive=true`)
            .then((response) => {
                if (!cancelled) {
                    setPayload(response);
                    // Seed Labels with initial values
                    const u = response.user;
                    firstNameRef.current?.setText(u.firstName, { userId: u.identifier, field: "firstName" });
                    lastNameRef.current?.setText(u.lastName, { userId: u.identifier, field: "lastName" });
                    emailRef.current?.setText(u.email, { userId: u.identifier, field: "email" });
                    statusRef.current?.setText(u.disabled ? "Disabled" : "Enabled", { userId: u.identifier, field: "status" });
                    updatedRef.current?.setText(new Date(u.updatedAt).toLocaleString(), { userId: u.identifier, field: "updated" });
                }
            })
            .finally(() => {
                if (!cancelled) setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [userid]);

    // PubSub subscription for live updates
    useEffect(() => {
        if (!userid) return;
        const token = subscribe(
            { and: [TAG_USER, userid, { or: [TAG_UPDATE, TAG_DISABLE] }] },
            (msg) => {
                const tags = msg.tags;
                const data = msg.data as Record<string, unknown> | undefined;

                if (tags.includes(TAG_UPDATE)) {
                    if (data?.firstName !== undefined) firstNameRef.current?.setText(String(data.firstName), { userId: userid, field: "firstName" });
                    if (data?.lastName !== undefined) lastNameRef.current?.setText(String(data.lastName), { userId: userid, field: "lastName" });
                    if (data?.email !== undefined) emailRef.current?.setText(String(data.email), { userId: userid, field: "email" });
                    if (data?.updatedAt !== undefined) updatedRef.current?.setText(new Date(String(data.updatedAt)).toLocaleString(), { userId: userid, field: "updated" });
                    // If group membership changed, re-fetch
                    if (data?.groupIdentifiers !== undefined) {
                        apiGet<UserDetailsResponse>(`/api/users/${encodeURIComponent(userid)}?includeInactive=true`)
                            .then((response) => {
                                setPayload(response);
                                firstNameRef.current?.setText(response.user.firstName, { userId: response.user.identifier, field: "firstName" });
                                lastNameRef.current?.setText(response.user.lastName, { userId: response.user.identifier, field: "lastName" });
                                emailRef.current?.setText(response.user.email, { userId: response.user.identifier, field: "email" });
                                statusRef.current?.setText(response.user.disabled ? "Disabled" : "Enabled", { userId: response.user.identifier, field: "status" });
                                updatedRef.current?.setText(new Date(response.user.updatedAt).toLocaleString(), { userId: response.user.identifier, field: "updated" });
                            })
                            .catch(() => {});
                    }
                }
                if (tags.includes(TAG_DISABLE)) {
                    const disabled = data?.disabled === true;
                    statusRef.current?.setText(disabled ? "Disabled" : "Enabled", { userId: userid, field: "status" });
                }
            },
        );
        return () => {
            if (typeof token === "string") {
                import("@/ui/pubsub").then((m) => m.unsubscribe(token));
            }
        };
    }, [userid]);

    const user = payload?.user;

    return (
        <PageTemplate urn={meta.urn} title={meta.title} description={meta.description}>
            <PageSection title="User details">
                {isLoading || !user ? (
                    <p>Loading user details...</p>
                ) : (
                    <>
                        <div className="admin-detail-grid">
                            <div><strong>First name:</strong> <Label ref={firstNameRef} text={user.firstName} /></div>
                            <div><strong>Last name:</strong> <Label ref={lastNameRef} text={user.lastName} /></div>
                            <div><strong>Email:</strong> <Label ref={emailRef} text={user.email} /></div>
                            <div><strong>Status:</strong> <Label ref={statusRef} text={user.disabled ? "Disabled" : "Enabled"} /></div>
                            <div><strong>Technical identifier:</strong> <code>{user.identifier}</code></div>
                            <div><strong>Created:</strong> {new Date(user.createdAt).toLocaleString()}</div>
                            <div><strong>Updated:</strong> <Label ref={updatedRef} text={new Date(user.updatedAt).toLocaleString()} /></div>
                        </div>

                        <div className="admin-toggle-row admin-top-gap">
                            <span>Show inactive groups and permissions</span>
                            <InputSwitch checked={showInactive} onChange={(event) => setShowInactive(Boolean(event.value))} />
                        </div>

                        <h3>Assigned groups</h3>
                        <div className="admin-chip-wrap">
                            {((payload.groups ?? []).filter(g => showInactive || !g.disabled)).map((group) => (
                                <Chip
                                    key={group.identifier}
                                    label={`${group.groupName} (${group.disabled ? "disabled" : "enabled"})`}
                                />
                            ))}
                        </div>

                        <h3>Functional permissions</h3>
                        <table className="mui-simple-table admin-table">
                            <thead>
                                <tr>
                                    <th>Permission</th>
                                    <th>Granted by groups</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                {((payload.functionalPermissions ?? [])).map((permission) => (
                                    <tr key={permission.identifier}>
                                        <td>{permission.functionalPermissionName}</td>
                                        <td>{(permission.grantedByGroups ?? []).map(g => g.groupName).join(", ") || "(none)"}</td>
                                        <td>{permission.description}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        <div className="admin-top-gap">
                            <Link to={`/admin/users${location.search}`}>Back to user list</Link>
                        </div>
                    </>
                )}
            </PageSection>
        </PageTemplate>
    );
}
