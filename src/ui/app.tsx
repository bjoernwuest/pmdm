import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, matchPath, NavLink, Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom";
import { buildNavTree, getAccessiblePages, getDefaultPath, getPageByUrn, getVisiblePages } from "./PageRegistry.ts";
import type { NavGroupItem, PageModule } from "../types/PageType.ts";
import { apiGet } from "@/ui/api/index.ts";
import { setDebugFrontend } from "@/ui/debug.ts";
import type {
    FunctionalPermissionDetailResponseType,
    GroupFunctionalPermissionResponseType,
    UserDetailsResponse
} from "../types/ApiType.ts";
import { getViewerContext } from "@/ui/api/session.ts";

/** Product name shown in the sidebar logo (derived projects override this string). */
const PRODUCT_NAME = "PMDM";

type ViewerContext = {
    user?: {
        displayName?: string | null;
        preferredUsername?: string | null;
    };
    permissionNames: string[];
    debugFrontend?: boolean;
};

function Loading() {
    // Indeterminate indicator: no fake percentage disconnected from real loading.
    return (
        <div className="app-loading-screen" role="status" aria-live="polite" aria-label="Loading application">
            <div className="app-loading-panel">
                <h1 className="app-loading-title">Loading application...</h1>
                <div className="app-loading-indeterminate-track" aria-hidden="true">
                    <div className="app-loading-indeterminate-fill" />
                </div>
            </div>
        </div>
    );
}

function UrnRedirect({ fallbackPath }: { fallbackPath: string }) {
    const { urn } = useParams();
    const pageByUrn = urn ? getPageByUrn(decodeURIComponent(urn)) : undefined;
    return <Navigate to={pageByUrn?.meta.path ?? fallbackPath} replace />;
}

function NoVisiblePage() {
    return (
        <div className="at-card">
            <h1 className="template-page-title">No visible pages</h1>
            <p className="template-page-description">
                Your account currently has no page-level functional permissions.
            </p>
        </div>
    );
}

/** Renders the hierarchical sidebar navigation. Groups are collapsible. */
function SidebarNav({ pages }: { pages: readonly PageModule[] }) {
    // Compute tree; also used once to seed the initial expanded set.
    const sections = useMemo(() => buildNavTree(pages), [pages]);

    // All groups are expanded by default.
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const tree = buildNavTree(pages);
        return new Set(
            tree.flatMap((s) =>
                s.items.filter((i): i is NavGroupItem => i.kind === "group").map((i) => i.page.meta.id),
            ),
        );
    });

    const toggle = useCallback((id: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    return (
        <nav className="sidebar-nav" aria-label="Main navigation">
            {sections.map(({ section, items }) => (
                <div key={section}>
                    <div className="sidebar-group-label">{section}</div>

                    {items.map((item) => {
                        if (item.kind === "leaf") {
                            return (
                                <NavLink
                                    key={item.page.meta.id}
                                    to={item.page.meta.path}
                                    className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                                >
                                    <span className="sidebar-link-label">{item.page.meta.menu.label}</span>
                                </NavLink>
                            );
                        }

                        // Group item: navigable parent link + collapse/expand toggle.
                        const isOpen = expanded.has(item.page.meta.id);
                        return (
                            <div key={item.page.meta.id} className="sidebar-nav-group">
                                <div className="sidebar-nav-group-header">
                                    <NavLink
                                        to={item.page.meta.path}
                                        className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
                                    >
                                        <span className="sidebar-link-label">{item.page.meta.menu.label}</span>
                                    </NavLink>
                                    <button
                                        type="button"
                                        className="sidebar-group-chevron"
                                        onClick={() => toggle(item.page.meta.id)}
                                        aria-expanded={isOpen}
                                        aria-label={isOpen ? "Collapse" : "Expand"}
                                    >
                                        {isOpen ? "▾" : "▸"}
                                    </button>
                                </div>

                                {isOpen &&
                                    item.children.map((child) => (
                                        <NavLink
                                            key={child.page.meta.id}
                                            to={child.page.meta.path}
                                            className={({ isActive }) =>
                                                `sidebar-link sidebar-link-sub${isActive ? " active" : ""}`
                                            }
                                        >
                                            <span className="sidebar-link-label">{child.page.meta.menu.label}</span>
                                        </NavLink>
                                    ))}
                            </div>
                        );
                    })}
                </div>
            ))}
        </nav>
    );
}

function AppShell({
    navPages,
    routePages,
    userDisplayName,
    userEmail,
}: {
    navPages: readonly PageModule[];
    routePages: readonly PageModule[];
    userDisplayName?: string | null;
    userEmail?: string | null;
}) {
    const location = useLocation();
    const [detailBreadcrumbLabel, setDetailBreadcrumbLabel] = useState<string | undefined>(undefined);
    const currentPage = useMemo(() => {
        const candidates = routePages
            .map((page) => ({ page, match: matchPath({ path: page.meta.path, end: false }, location.pathname) }))
            .filter((entry) => entry.match !== null)
            .sort((a, b) => b.page.meta.path.length - a.page.meta.path.length);
        return candidates[0]?.page;
    }, [location.pathname, routePages]);
    const pageById = useMemo(() => new Map(routePages.map((page) => [page.meta.id, page])), [routePages]);

    useEffect(() => {
        let cancelled = false;
        setDetailBreadcrumbLabel(undefined);

        // Generic resolution: the matched page declares its detail-label fetch via
        // `meta.detailBreadcrumb`; failures silently fall back to the static menu label.
        const resolver = currentPage?.meta.detailBreadcrumb?.resolveLabel;
        if (!resolver) return;

        const match = matchPath({ path: currentPage.meta.path, end: false }, location.pathname);
        const params = (match?.params ?? {}) as Record<string, string | undefined>;
        void resolver(params).then((label) => {
            if (!cancelled) setDetailBreadcrumbLabel(label);
        }).catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [location.pathname, currentPage]);

    const breadcrumb = useMemo(() => {
        if (!currentPage) return [{ label: "General" }];

        const sectionRoot = navPages
            .filter((page) => page.meta.menu.section === currentPage.meta.menu.section && !page.meta.menu.parent)
            .sort((a, b) => a.meta.menu.order - b.meta.menu.order)[0];

        const parentItems: Array<{ label: string; to?: string }> = [];
        let parentId = currentPage.meta.menu.parent;
        while (parentId) {
            const parent = pageById.get(parentId);
            if (!parent) break;
            if (!parent.meta.menu.hidden) parentItems.unshift({ label: parent.meta.menu.label, to: parent.meta.path });
            parentId = parent.meta.menu.parent;
        }

        return [
            { label: currentPage.meta.menu.section, to: sectionRoot?.meta.path },
            ...parentItems,
            { label: detailBreadcrumbLabel ?? currentPage.meta.menu.label },
        ];
    }, [currentPage, detailBreadcrumbLabel, navPages, pageById]);

    const initials = (userDisplayName ?? "?").slice(0, 2).toUpperCase();

    return (
        <div className="app-shell sidebar-open">
            <aside className="app-sidebar">
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        <span className="sidebar-logo-icon">B</span>
                        <span className="sidebar-logo-text-wrap">
                            <span className="sidebar-logo-text">{PRODUCT_NAME}</span>
                        </span>
                    </div>
                </div>

                <SidebarNav pages={navPages} />

                <div className="sidebar-footer">
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-meta">
                            <button
                                type="button"
                                className="sidebar-inline-logout-btn"
                                onClick={() => {
                                    window.location.href = "/login/local-logout";
                                }}
                                aria-label="Logout"
                                title="Logout"
                            >
                                <i className="pi pi-sign-out" aria-hidden="true" />
                            </button>
                            <Link to="/profile" className="sidebar-user-avatar-link" aria-label="User Profile">
                                <div className="sidebar-user-avatar">{initials}</div>
                            </Link>
                            <div className="sidebar-user-text">
                                <div className="sidebar-user-name">{userDisplayName ?? "Unknown user"}</div>
                                <div className="sidebar-user-email">{userEmail ?? "No email available"}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            <div className="app-content">
                <header className="app-topbar">
                    <div className="app-topbar-title-wrap">
                        <div className="app-topbar-breadcrumb">
                            {breadcrumb.map((item, index) => {
                                const isLast = index === breadcrumb.length - 1;
                                if (!isLast && item.to) {
                                    return <span key={`${item.label}:${index}`}><Link to={item.to}>{item.label}</Link>{" > "}</span>;
                                }
                                return <span key={`${item.label}:${index}`}>{item.label}{!isLast ? " > " : ""}</span>;
                            })}
                        </div>
                        <h1 className="app-topbar-title">{currentPage?.meta.title ?? "Page"}</h1>
                    </div>
                    <div className="app-topbar-actions" />
                </header>

                <main className="app-main-content">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}

export default function AppLayout() {
    const [context, setContext] = useState<ViewerContext>({ permissionNames: [] });
    const [isLoadingContext, setIsLoadingContext] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const loadContext = async () => {
            try {
                const payload = await getViewerContext();
                setDebugFrontend(payload.debugFrontend ?? false);
                if (!cancelled) setContext({
                    user: payload.user,
                    permissionNames: Array.isArray(payload.permissionNames) ? payload.permissionNames : [],
                    debugFrontend: payload.debugFrontend ?? false,
                });
            } catch {
                // Intentionally ignore load errors; auth redirect and fallback UI are handled elsewhere.
            } finally {
                if (!cancelled) setIsLoadingContext(false);
            }
        };

        loadContext();
        return () => { cancelled = true; };
    }, []);

    const visiblePages = useMemo(() => getVisiblePages(context.permissionNames), [context.permissionNames]);
    const accessiblePages = useMemo(() => getAccessiblePages(context.permissionNames), [context.permissionNames]);
    const defaultPath  = useMemo(() => getDefaultPath(context.permissionNames),  [context.permissionNames]);

    if (isLoadingContext) return <Loading />;

    return (
        <Routes>
            <Route
                path="/"
                element={<AppShell navPages={visiblePages} routePages={accessiblePages} userDisplayName={context.user?.displayName ?? null} userEmail={context.user?.preferredUsername ?? null} />}
            >
                <Route index element={<Navigate to={defaultPath} replace />} />
                {accessiblePages.map((pageModule) => (
                    <Route
                        key={pageModule.meta.id}
                        path={pageModule.meta.path.replace(/^\//, "")}
                        element={<pageModule.Component />}
                    />
                ))}
                <Route path="urn/:urn" element={<UrnRedirect fallbackPath={defaultPath} />} />
                <Route
                    path="*"
                    element={visiblePages.length > 0 ? <Navigate to={defaultPath} replace /> : <NoVisiblePage />}
                />
            </Route>
        </Routes>
    );
}