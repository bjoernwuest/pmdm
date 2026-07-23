import { apiGet, apiPost, apiPut } from "./index.ts";
import type {
    ProductRequestListRow,
    ProductRequestValueEnriched,
    ProductRequestDetail,
} from "@/types/ProductRequestType.ts";
import type { LookupValue, ConsumableValue } from "@/types/ConfigurationTypes.ts";

const BASE = "/api/product-requests";

// ---------------------------------------------------------------------------
// Response Types
// ---------------------------------------------------------------------------

export type ProductRequestListResponse = {
    requests: ProductRequestListRow[];
    page: number;
    pageSize: number;
    total: number;
    availablePageSizes: number[];
};

export type ProductRequestDetailResponse = ProductRequestDetail;

export type CreateProductRequestResponse = {
    productRequestId: string;
};

export type UpdateProductRequestValueResponse = {
    value: ProductRequestValueEnriched;
    recalculated: ProductRequestValueEnriched[];
};

export type ApproveProductRequestValueResponse = {
    value: ProductRequestValueEnriched;
    allApproved: boolean;
};

export type ApproveAllProductRequestValuesResponse = {
    approvedCount: number;
    allApproved: boolean;
};

export type ProductRequestLookupValuesResponse = {
    values: LookupValue[];
};

export type ProductRequestConsumableValuesResponse = {
    values: ConsumableValue[];
};

// ---------------------------------------------------------------------------
// API Functions
// ---------------------------------------------------------------------------

/** Creates a new product request. */
export async function createProductRequest(data: {
    mode: "new" | "update" | "copy";
    productTypeIdentifier?: string;
    productNumber?: string;
    sourceProductNumber?: string;
}): Promise<CreateProductRequestResponse> {
    return apiPost<CreateProductRequestResponse>(`${BASE}`, data);
}

/** Returns a paginated, filtered list of product requests. */
export async function getProductRequests(
    page: number,
    pageSize: number,
    filters?: {
        status?: string[];
        productTypeIdentifier?: string;
        productNumberContains?: string;
        actionFilter?: "provide_or_approve" | "provide_value" | "approve_value";
    },
): Promise<ProductRequestListResponse> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (filters?.status?.length) params.set("status", filters.status.join(","));
    if (filters?.productTypeIdentifier) params.set("productTypeIdentifier", filters.productTypeIdentifier);
    if (filters?.productNumberContains) params.set("productNumberContains", filters.productNumberContains);
    if (filters?.actionFilter) params.set("actionFilter", filters.actionFilter);
    return apiGet<ProductRequestListResponse>(`${BASE}?${params.toString()}`);
}

/** Returns a single product request with enriched values. */
export async function getProductRequest(id: string): Promise<ProductRequestDetailResponse> {
    return apiGet<ProductRequestDetailResponse>(`${BASE}/${encodeURIComponent(id)}`);
}

/** Updates a single data type value on a product request. */
export async function updateProductRequestValue(
    requestId: string,
    dataTypeIdentifier: string,
    value: unknown,
): Promise<UpdateProductRequestValueResponse> {
    return apiPut<UpdateProductRequestValueResponse>(
        `${BASE}/${encodeURIComponent(requestId)}/values/${encodeURIComponent(dataTypeIdentifier)}`,
        { value },
    );
}

/** Approves a single data type value on a product request. */
export async function approveProductRequestValue(
    requestId: string,
    dataTypeIdentifier: string,
): Promise<ApproveProductRequestValueResponse> {
    return apiPost<ApproveProductRequestValueResponse>(
        `${BASE}/${encodeURIComponent(requestId)}/approve/${encodeURIComponent(dataTypeIdentifier)}`,
        {},
    );
}

/** Approves all unapproved values the current user can approve. */
export async function approveAllProductRequestValues(
    requestId: string,
): Promise<ApproveAllProductRequestValuesResponse> {
    return apiPost<ApproveAllProductRequestValuesResponse>(
        `${BASE}/${encodeURIComponent(requestId)}/approve-all`,
        {},
    );
}

/**
 * Returns lookup values for a lookup-kind data type, scoped to the current
 * user's data-type-level role on the product request (viewer/writer/approver)
 * rather than the Configuration-area lookup-management permission. Used to
 * populate selection dropdowns and resolve display names for lookup values.
 */
export async function getProductRequestLookupValues(
    requestId: string,
    dataTypeIdentifier: string,
): Promise<ProductRequestLookupValuesResponse> {
    return apiGet<ProductRequestLookupValuesResponse>(
        `${BASE}/${encodeURIComponent(requestId)}/lookup-values/${encodeURIComponent(dataTypeIdentifier)}`,
    );
}

/**
 * Returns consumable values for a consumable-kind data type, scoped to the
 * current user's data-type-level role on the product request (viewer/writer/
 * approver) rather than the Configuration-area consumable-management
 * permission. Used to populate selection dropdowns and resolve display names
 * for consumable values.
 */
export async function getProductRequestConsumableValues(
    requestId: string,
    dataTypeIdentifier: string,
): Promise<ProductRequestConsumableValuesResponse> {
    return apiGet<ProductRequestConsumableValuesResponse>(
        `${BASE}/${encodeURIComponent(requestId)}/consumable-values/${encodeURIComponent(dataTypeIdentifier)}`,
    );
}

/** Cancels an open product request. */
export async function cancelProductRequest(id: string): Promise<ProductRequestDetailResponse> {
    return apiPost<ProductRequestDetailResponse>(
        `${BASE}/${encodeURIComponent(id)}/cancel`,
        {},
    );
}

/** Finds an open request for a given product number, returning its identifier or null. */
export async function findOpenRequestForProduct(productNumber: string): Promise<string | null> {
    try {
        const result = await getProductRequests(0, 50, {
            status: ["open", "importing"],
            productNumberContains: productNumber,
        });
        const match = result.requests.find(r => r.productNumber === productNumber);
        return match?.identifier ?? null;
    } catch {
        return null;
    }
}
