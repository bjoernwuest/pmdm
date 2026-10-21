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
