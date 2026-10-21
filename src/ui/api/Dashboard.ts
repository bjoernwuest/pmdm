import { apiGet } from "./index.ts";
import type { PendingProductRequestsByGroupResponse } from "@/types/DashboardType.ts";

const BASE = "/api/dashboard";

/** Returns pending product request counts per group for the dashboard chart. */
export async function getPendingProductRequestsByGroup(): Promise<PendingProductRequestsByGroupResponse> {
    return apiGet<PendingProductRequestsByGroupResponse>(`${BASE}/pending-product-requests-by-group`);
}
