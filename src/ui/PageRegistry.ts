import type { NavGroupItem, NavItem, NavLeafItem, NavSection, PageMeta, PageModule } from "@/types/PageType.ts";
import { autoPageModules } from "./_pageRegistry.generated.ts";
import { pageModules as appPageModules } from "@/ui/app_PageRegistry.ts";

/**
 * Registry of all available pages in the application.
 *
 * Role of this file in the three-file arrangement: the COMBINER — it merges the
 * auto-generated page list (`_pageRegistry.generated.ts`) with the downstream escape-hatch
 * registrations (`app_PageRegistry.ts`) and exposes navigation helpers. Do not list pages here.
 *
 * Each entry includes both the page metadata (for routing, permissions, menu configuration)
 * and the React component to render. The order of pages affects default routing and
 * navigation ordering.
 */
export const pageModules: readonly PageModule[] = [
    ...autoPageModules,
    ...appPageModules,
];

/**
 * Checks if a page should be visible to a user based on its configuration and the user's permissions.
 *
 * A page is visible if:
 * 1. It's not explicitly hidden via `meta.menu.hidden`
 * 2. AND either:
 *    - It has no permission requirements, OR
 *    - The user has ALL required functional permissions
 *
 * @param meta - The page metadata containing visibility and permission configuration
 * @param permissionNames - Array of functional permission names the user possesses
 *
 * @returns `true` if the page should be shown to this user, `false` otherwise
 *
 * @example
 * ```typescript
 * const isVisible = isPageVisible(adminPageMeta, ["view_users", "view_permissions"]);
 * ```
 */
export function isPageVisible(meta: PageMeta, permissionNames: readonly string[]): boolean {
    if (meta.menu.hidden) return false;
    if (!meta.requiredFunctionalPermissions || meta.requiredFunctionalPermissions.length === 0) return true;
    return meta.requiredFunctionalPermissions.every((permissionName) => permissionNames.includes(permissionName));
}

function hasPageAccess(meta: PageMeta, permissionNames: readonly string[]): boolean {
    if (!meta.requiredFunctionalPermissions || meta.requiredFunctionalPermissions.length === 0) return true;
    return meta.requiredFunctionalPermissions.every((permissionName) => permissionNames.includes(permissionName));
}

/**
 * Retrieves all pages that are visible to a user, sorted by section and menu order.
 *
 * This function filters the global page registry based on the user's functional permissions
 * and returns them in the correct display order (grouped by section, then by menu order within section).
 *
 * Used throughout the app to determine which pages a user can access and navigate to.
 *
 * @param permissionNames - Array of functional permission names the user has been granted
 *
 * @returns Array of visible page modules, sorted by section name (alphabetically) then by menu order.
 *          Returns empty array if user has no accessible pages.
 *
 * @example
 * ```typescript
 * // Get all pages visible to a standard user
 * const visiblePages = getVisiblePages(userPermissions);
 * console.log(visiblePages.length); // e.g., 2 pages
 *
 * // Build a navigation menu from visible pages
 * const navItems = visiblePages.map(p => p.meta);
 * ```
 */
export function getVisiblePages(permissionNames: readonly string[]): PageModule[] {
    const visible = getAccessiblePages(permissionNames)
        .filter((pageModule) => !pageModule.meta.menu.hidden)
        .sort((a, b) => {
            if (a.meta.menu.section !== b.meta.menu.section) return a.meta.menu.section.localeCompare(b.meta.menu.section);
            return a.meta.menu.order - b.meta.menu.order;
        });

    const visibleChildrenByParent = visible.reduce<Map<string, number>>((acc, pageModule) => {
        const parentId = pageModule.meta.menu.parent;
        if (!parentId) return acc;
        acc.set(parentId, (acc.get(parentId) ?? 0) + 1);
        return acc;
    }, new Map());

    const pageIdsThatActAsParent = new Set(
        pageModules
            .flatMap((module) => {
                const parentId = module.meta.menu.parent;
                return parentId && !module.meta.menu.hidden ? [parentId] : [];
            }),
    );

    return visible.filter((pageModule) => {
        if (!pageIdsThatActAsParent.has(pageModule.meta.id)) return true;
        return (visibleChildrenByParent.get(pageModule.meta.id) ?? 0) > 0;
    });
}

/** Returns all permission-accessible pages, including hidden routes used for detail screens. */
export function getAccessiblePages(permissionNames: readonly string[]): PageModule[] {
    return pageModules
        .filter((pageModule) => hasPageAccess(pageModule.meta, permissionNames))
        .sort((a, b) => {
            if (a.meta.menu.section !== b.meta.menu.section) return a.meta.menu.section.localeCompare(b.meta.menu.section);
            return a.meta.menu.order - b.meta.menu.order;
        });
}

/**
 * Finds a page by its unique URN (Uniform Resource Name) identifier.
 *
 * URN is a stable, unique identifier for each page used for programmatic lookups.
 * This is useful when you need to reference a specific page dynamically without
 * relying on path changes.
 *
 * @param urn - The unique URN of the page to find (e.g., "page:doc", "page:admin")
 *
 * @returns The page module if found, `undefined` if no page with that URN exists
 *
 * @example
 * ```typescript
 * const adminPage = getPageByUrn("page:admin");
 * if (adminPage) {
 *     console.log(adminPage.meta.path); // "/admin"
 * }
 * ```
 */
export function getPageByUrn(urn: string): PageModule | undefined { return pageModules.find((pageModule) => pageModule.meta.urn === urn); }

/**
 * Determines the default landing page path for a user based on their functional permissions.
 *
 * This function is typically used during login or navigation to route users to the most
 * appropriate starting page. It respects the user's permission-based access control by
 * showing them the highest-priority page they are allowed to view.
 *
 * @param permissionNames - Array of functional permission names the user has been granted.
 *                         These are used to filter which pages are visible to the user.
 *
 * @returns The path (route) of the default page for this user.
 *
 * **Return cases:**
 * - If the user has access to at least one page: Returns the path of the first visible page
 *   (pages are pre-sorted by section and menu order via `getVisiblePages`).
 * - If the user has no permissions or all pages are hidden: Returns `"/"` as a fallback.
 *
 * **About the `/doc` fallback:**
 * The `/doc` page is the documentation/help page and serves as the universal fallback.
 * This ensures that even users with highly restricted permissions (no page access) can
 * still access the documentation. The Doc page typically has no permission requirements,
 * making it always accessible to all authenticated users.
 *
 * @example
 * ```typescript
 * // User with admin permissions → likely returns "/admin"
 * const adminPath = getDefaultPath(["view_users", "view_permissions"]);
 *
 * // User with no permissions → falls back to documentation
 * const docPath = getDefaultPath([]);
 * ```
 */
export function getDefaultPath(permissionNames: readonly string[]): string {
    // Current behavior: the default path is the first visible page by menu order; when no page is
    // visible the app falls back to "/".
    const visiblePages = getVisiblePages(permissionNames);
    const firstVisible = visiblePages[0];
    if (firstVisible) return firstVisible.meta.path;
    return "/";
}

/**
 * Builds a grouped, hierarchical navigation tree from a flat list of visible pages.
 *
 * Pages with `menu.parent` set are nested under the matching parent page.
 * If a parent is not present in the list (e.g. filtered out by permissions),
 * its orphaned children are hidden entirely.
 *
 * @param pages - The flat list of visible pages to organize into a tree structure
 *
 * @returns Navigation structure grouped by section, with each section containing root pages
 *          and their nested children as a hierarchical tree
 *
 * @example
 * ```typescript
 * const visiblePages = getVisiblePages(userPermissions);
 * const navTree = buildNavTree(visiblePages);
 * // Result: [{ section: "Main", items: [...] }, { section: "Admin", items: [...] }]
 * ```
 */
export function buildNavTree(pages: readonly PageModule[]): NavSection[] {
    const sorted = [...pages].sort((a, b) => {
        if (a.meta.menu.section !== b.meta.menu.section) {
            return a.meta.menu.section.localeCompare(b.meta.menu.section);
        }
        return a.meta.menu.order - b.meta.menu.order;
    });

    const bySection = sorted.reduce<Record<string, PageModule[]>>((acc, page) => {
        const s = page.meta.menu.section;
        const sectionPages = acc[s];
        if (sectionPages) sectionPages.push(page);
        else acc[s] = [page];
        return acc;
    }, {});

    return Object.entries(bySection).map(([section, sectionPages]): NavSection => {
        const pageIds = new Set(sectionPages.map((p) => p.meta.id));

        // Roots: only pages without a parent. Orphaned children are hidden.
        const roots = sectionPages.filter((p) => !p.meta.menu.parent);

        // Children indexed by parent ID.
        const childrenByParent = sectionPages
            .flatMap((p) => {
                const parent = p.meta.menu.parent;
                return parent && pageIds.has(parent) ? [{ parent, page: p }] : [];
            })
            .reduce<Record<string, PageModule[]>>((acc, { parent, page: p }) => {
                const childPages = acc[parent];
                if (childPages) childPages.push(p);
                else acc[parent] = [p];
                return acc;
            }, {});

        const items: NavItem[] = roots.map((root): NavItem => {
            const children = childrenByParent[root.meta.id];
            if (children && children.length > 0) {
                return {
                    kind: "group",
                    page: root,
                    children: children.map((c): NavLeafItem => ({ kind: "leaf", page: c })),
                } satisfies NavGroupItem;
            }
            return { kind: "leaf", page: root } satisfies NavLeafItem;
        });

        return { section, items };
    });
}
