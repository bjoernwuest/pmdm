import { apiGet } from "./index.ts";
import type { MeContextResponse } from "@/types/AuthType.ts";

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

