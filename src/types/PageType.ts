import type { ComponentType } from "react";

/** Describes how a page should appear in the application's navigation menu. */
export type MenuEntry = {
    /** The menu group or section the page belongs to. */
    section: string;
    /** Sort order within the menu section. Lower values appear first. */
    order: number;
    /** The human-readable label shown in the menu. */
    label: string;
    /**
     * Optional parent page ID. When set, this page is nested beneath the
     * referenced page in the menu hierarchy.
     */
    parent?: string;
    /** When `true`, the page is excluded from navigation menus. */
    hidden?: boolean;
};

/**
 * Shared metadata for an application page.
 *
 * This is the central contract used by the UI to:
 * - build routes,
 * - generate navigation menus,
 * - expose a bookmarkable URN,
 * - and decide visibility based on functional permissions.
 */
export type PageMeta = {
    /** Stable internal page identifier. */
    id: string;
    /** Unique resource name used for referencing the page. */
    urn: string;
    /** Route path used by the client-side router. */
    path: string;
    /** Page title shown in the UI. */
    title: string;
    /** Short description of what the page does. */
    description: string;
    /** Navigation entry metadata. */
    menu: MenuEntry;
    /** Functional permissions required to see or access this page. */
    requiredFunctionalPermissions?: readonly string[];
};

/** A page module combines metadata with the React component that renders the page. */
export type PageModule = {
    /** Page metadata consumed by routing and navigation. */
    meta: PageMeta;
    /** React component rendered for the page. */
    Component: ComponentType;
};

// ── Navigation tree types ─────────────────────────────────────────────────────

/** A leaf nav item that links directly to a single page. */
export type NavLeafItem = {
    kind: "leaf";
    page: PageModule;
};

/**
 * A group nav item whose children are nested beneath it in the sidebar.
 * The group itself is still a navigable page.
 */
export type NavGroupItem = {
    kind: "group";
    page: PageModule;
    children: NavLeafItem[];
};

/** A single item in a nav section – either a leaf or a collapsible group. */
export type NavItem = NavLeafItem | NavGroupItem;

/** A top-level section in the sidebar containing one or more nav items. */
export type NavSection = {
    section: string;
    items: NavItem[];
};
