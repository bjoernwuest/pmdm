// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import type {DataTypeGroupRoles} from "@/types/_DataTypeType.ts";
import type {ProductRequestsSelectType, ProductRequestsValuesSelectType} from "@/types/_ProductRequestType.ts";
import {TAG_CREATE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from './_ProductRequestType.ts';

// ---------------------------------------------------------------------------
// PubSub message topics
// ---------------------------------------------------------------------------

/** Resource tag for ProductRequest. */
export const TAG_PRODUCT_REQUEST = "product_request" as const;
/** Resource tag for ProductRequestValue. */
export const TAG_PRODUCT_REQUEST_VALUE = "product_request_value" as const;
/** Action tag for approve events. */
export const TAG_APPROVE = "approve" as const;
/** Action tag for cancel events. */
export const TAG_CANCEL = "cancel" as const;
/** Action tag for importing events. */
export const TAG_IMPORTING = "importing" as const;
/** Action tag for done events. */
export const TAG_DONE = "done" as const;
/** Aspect tag for mandatory script re-evaluation. */
export const TAG_MANDATORY = "mandatory" as const;
/** Aspect tag for requestorCanEdit script re-evaluation. */
export const TAG_REQUESTOR_CAN_EDIT = "requestor_can_edit" as const;

/** PubSub topic for product request create events. */
export const message_CreateProductRequest: Tag[] = [TAG_PRODUCT_REQUEST, TAG_CREATE];
/** PubSub topic for product request value update events. */
export const message_UpdateProductRequestValue: Tag[] = [TAG_PRODUCT_REQUEST_VALUE, TAG_UPDATE];
/** PubSub topic for product request value approval events. */
export const message_ApproveProductRequestValue: Tag[] = [TAG_PRODUCT_REQUEST_VALUE, TAG_APPROVE];
/** PubSub topic for product request cancellation events. */
export const message_CancelProductRequest: Tag[] = [TAG_PRODUCT_REQUEST, TAG_CANCEL];
/** PubSub topic for product request status progression to importing. */
export const message_ImportingProductRequest: Tag[] = [TAG_PRODUCT_REQUEST, TAG_IMPORTING];
/** PubSub topic for product request transition to done. */
export const message_DoneProductRequest: Tag[] = [TAG_PRODUCT_REQUEST, TAG_DONE];
/** PubSub topic for mandatory & requestorCanEdit script re-evaluation results. */
export const message_MandatoryAndRequestorCanEditUpdated: Tag[] = [
    TAG_PRODUCT_REQUEST,
    TAG_MANDATORY,
    TAG_REQUESTOR_CAN_EDIT,
    TAG_UPDATE,
];
/** PubSub topic for product export marked as exported. */
export const message_ProductExportExported: Tag[] = ["ProductExport", "exported"];
/** PubSub topic for product export marked as imported. */
export const message_ProductExportImported: Tag[] = ["ProductExport", "imported"];

// ---------------------------------------------------------------------------
// Enriched types for API responses
// ---------------------------------------------------------------------------

/** Product request list row enriched with product type and creator name. */
export type ProductRequestListRow = ProductRequestsSelectType & {
    productTypeName: string;
    createdByName: string;
    actionableSummary: {
        needsValue: boolean;
        needsApproval: boolean;
    };
};

/** Product request value enriched with data type metadata and resolved permissions. */
export type ProductRequestValueEnriched = ProductRequestsValuesSelectType & {
    dataTypeName: string;
    dataTypeDescription: string | null;
    dataTypeKind: string;
    dataTypeConfig: Record<string, unknown>;
    mandatory: boolean | null;       // Resolved from ProductTypesDataTypes > DataType
    requestorCanEdit: boolean | null;
    editableOnUpdate: boolean;
    businessDomainName: string | null;
    // Resolved permissions for current user
    userRoles: DataTypeGroupRoles[];
    showByDefault: boolean;
    // Resolved user info for display
    editorName: string | null;
    editorEmail: string | null;
    approverName: string | null;
    approverEmail: string | null;
    // Previous-approval dependency status
    previousApprovalDepsMet: boolean;
    previousApprovalDepsWaiting: string[];
};

/** Product request detail enriched with product type name, creator name, and values. */
export type ProductRequestDetail = ProductRequestsSelectType & {
    productTypeName: string;
    createdByName: string;
    values: ProductRequestValueEnriched[];
};

/** Payload for {@link message_MandatoryAndRequestorCanEditUpdated}. */
export type MandatoryAndRequestorCanEditPayload = {
    productRequest: string;
    mandatory: Record<string, boolean>;
    requestorCanEdit: Record<string, boolean>;
};
