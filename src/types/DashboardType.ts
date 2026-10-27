import { Type, type Static } from "@sinclair/typebox";

/** One group's pending product request counts for the dashboard chart. */
export const PendingRequestsByGroupSchema = Type.Object({
    groupIdentifier: Type.String({ format: "uuid", description: "Identifier of the group." }),
    groupName: Type.String({ description: "Display name of the group." }),
    pendingApproval: Type.Integer({ minimum: 0, description: "Number of open product requests with at least one value awaiting approval by this group." }),
    pendingDataEntry: Type.Integer({ minimum: 0, description: "Number of open product requests with at least one empty value this group is responsible to fill." }),
    total: Type.Integer({ minimum: 0, description: "Sum of pendingApproval and pendingDataEntry." }),
}, { description: "Pending product request counts for one group." });
export type PendingRequestsByGroup = Static<typeof PendingRequestsByGroupSchema>;

export const PendingProductRequestsByGroupResponseSchema = Type.Object({
    groups: Type.Array(PendingRequestsByGroupSchema, { description: "Groups with pending work, sorted by total descending and group name ascending on ties." }),
}, { description: "Pending product request counts grouped by group." });
export type PendingProductRequestsByGroupResponse = Static<typeof PendingProductRequestsByGroupResponseSchema>;

/** One open product request offered in the dashboard gap-analysis dropdown. */
export const OpenProductRequestOptionSchema = Type.Object({
    identifier: Type.String({ format: "uuid", description: "Identifier of the product request." }),
    productNumber: Type.String({ description: "Product number of the request." }),
    productTypeName: Type.String({ description: "Name of the request's product type." }),
    createdByName: Type.String({ description: "Display name of the user who created the request." }),
}, { description: "An open product request available for gap analysis." });
export type OpenProductRequestOption = Static<typeof OpenProductRequestOptionSchema>;

export const OpenProductRequestListResponseSchema = Type.Object({
    requests: Type.Array(OpenProductRequestOptionSchema, { description: "Open product requests ordered by product number ascending." }),
}, { description: "Open product requests available for dashboard gap analysis." });
export type OpenProductRequestListResponse = Static<typeof OpenProductRequestListResponseSchema>;

/** Reference to a group responsible for providing or approving a field. */
export const DashboardGroupRefSchema = Type.Object({
    identifier: Type.String({ format: "uuid", description: "Identifier of the group." }),
    name: Type.String({ description: "Display name of the group." }),
}, { description: "A group responsible for providing or approving a value." });
export type DashboardGroupRef = Static<typeof DashboardGroupRefSchema>;

export const DashboardApprovalStateSchema = Type.Union([
    Type.Literal("pending", { description: "The value is ready and waiting for approval." }),
    Type.Literal("blocked", { description: "Approval is blocked by unmet previous-approval prerequisites." }),
    Type.Literal("waiting_for_value", { description: "The recommended value is still missing for a mandatory field." }),
], { description: "Approval state of a gap field." });
export type DashboardApprovalState = Static<typeof DashboardApprovalStateSchema>;

/** One field with a missing value or a missing approval on an open request. */
export const DashboardGapFieldSchema = Type.Object({
    dataTypeIdentifier: Type.String({ format: "uuid", description: "Identifier of the data type." }),
    dataTypeName: Type.String({ description: "Name of the data type." }),
    dataTypeKind: Type.String({ description: "Kind of the data type (for example string, lookup, or boolean)." }),
    mandatory: Type.Boolean({ description: "Whether the field is mandatory for the dashboard viewer." }),
    valueMissing: Type.Boolean({ description: "Whether the field still needs a value from the responsible writer." }),
    approvalState: Type.Optional(DashboardApprovalStateSchema),
    approvalBlockedBy: Type.Array(Type.String({ description: "Name of a prerequisite data type that is not approved yet." }), { description: "Previous-approval prerequisites that block this field." }),
    providerGroups: Type.Array(DashboardGroupRefSchema, { description: "Groups responsible for providing the value." }),
    approverGroups: Type.Array(DashboardGroupRefSchema, { description: "Groups responsible for approving the value." }),
}, { description: "A field with missing work on an open product request." });
export type DashboardGapField = Static<typeof DashboardGapFieldSchema>;

export const OpenProductRequestGapAnalysisSchema = Type.Object({
    identifier: Type.String({ format: "uuid", description: "Identifier of the product request." }),
    productNumber: Type.String({ description: "Product number of the request." }),
    productTypeName: Type.String({ description: "Name of the request's product type." }),
    createdByName: Type.String({ description: "Display name of the user who created the request." }),
    productToUpdate: Type.Union([Type.String({ description: "Product number being updated." }), Type.Null({ description: "Null when this is not an update request." })]),
    fields: Type.Array(DashboardGapFieldSchema, { description: "Fields with missing values or missing approvals, ordered by data type name." }),
}, { description: "Gap analysis for one open product request." });
export type OpenProductRequestGapAnalysis = Static<typeof OpenProductRequestGapAnalysisSchema>;

export const NotifyOpenRequestResponseSchema = Type.Object({
    sentTo: Type.Integer({ minimum: 0, description: "Number of reminder emails sent." }),
    skippedReason: Type.Optional(Type.Union([
        Type.Literal("notifications_disabled", { description: "The notification system is disabled." }),
        Type.Literal("missing_sender", { description: "The configured sender address is missing." }),
        Type.Literal("no_actionable_recipients", { description: "No user has an actionable item on the selected request." }),
    ], { description: "Why no email was sent; omitted when at least one email was sent." })),
}, { description: "Outcome of a request-scoped manual reminder send." });
export type NotifyOpenRequestResponse = Static<typeof NotifyOpenRequestResponseSchema>;

export const OpenProductRequestParamsSchema = Type.Object({
    identifier: Type.String({ format: "uuid", description: "Identifier of the open product request." }),
}, { description: "Path parameters for a single open product request." });
export type OpenProductRequestParams = Static<typeof OpenProductRequestParamsSchema>;
