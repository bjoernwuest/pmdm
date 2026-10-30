import { apiGet } from "./index.ts";
import type { MeContextResponse } from "@/types/AuthType.ts";
import type { EffectivePermissionsResponse } from "@/types/EffectivePermissionsType.ts";

let loginRedirectInProgress = false;

export function triggerLoginRedirect(): void {
    if (loginRedirectInProgress) return;

    loginRedirectInProgress = true;
    const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?returnTo=${returnTo}`;
}

/** Current user identity and functional permissions (GET /api/me/context). */
export async function getViewerContext(): Promise<MeContextResponse> {
    return apiGet<MeContextResponse>("/api/me/context");
}

/** Current user functional permissions and product-type capabilities (GET /api/me/effective-permissions). */
export async function getMyEffectivePermissions(): Promise<EffectivePermissionsResponse> {
    return apiGet<EffectivePermissionsResponse>("/api/me/effective-permissions");
}

