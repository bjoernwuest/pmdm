import { apiGet, apiPost } from "./index.ts";
import type {
    NotifyOpenRequestResponse,
    OpenProductRequestGapAnalysis,
    OpenProductRequestListResponse,
    PendingProductRequestsByGroupResponse,
} from "@/types/DashboardType.ts";

const BASE = "/api/dashboard";

/** Returns pending product request counts per group for the dashboard chart. */
export async function getPendingProductRequestsByGroup(): Promise<PendingProductRequestsByGroupResponse> {
    return apiGet<PendingProductRequestsByGroupResponse>(`${BASE}/pending-product-requests-by-group`);
}

/** Returns the open product requests available for gap analysis. */
export async function getOpenProductRequestOptions(): Promise<OpenProductRequestListResponse> {
    return apiGet<OpenProductRequestListResponse>(`${BASE}/open-product-requests`);
}

/** Returns the gap analysis for one open product request. */
export async function getOpenRequestGapAnalysis(identifier: string): Promise<OpenProductRequestGapAnalysis> {
    return apiGet<OpenProductRequestGapAnalysis>(
        `${BASE}/open-product-requests/${encodeURIComponent(identifier)}/gap-analysis`,
    );
}

/** Sends a request-scoped reminder to everyone with actionable work. */
export async function notifyOpenRequest(identifier: string): Promise<NotifyOpenRequestResponse> {
    return apiPost<NotifyOpenRequestResponse>(
        `${BASE}/open-product-requests/${encodeURIComponent(identifier)}/notify`,
        {},
    );
}
