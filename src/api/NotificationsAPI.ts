import { status, t } from "elysia";
import { Type } from "@sinclair/typebox";
import type { ApiInstance } from "@/apps/api.ts";
import { getConfigEntriesByKey, updateConfigEntry } from "@/repo/ConfigRepo.ts";
import { sendToUser, simulateEmail } from "@/services/Notifications.ts";
import { requirePermissions } from "@/services/Auth.ts";
import { FP_NOTIFICATIONS } from "@/services/auth/ApplicationDefinedFunctionalPermissions.ts";
import { getUsers } from "@/repo/UserRepo.ts";
import { getGroups } from "@/repo/UserRepo.ts";
import type { ConfigEntrySelectType } from "@/types/ConfigType.ts";
import {
    ForbiddenErrorResponseSchema,
    NotFoundErrorResponseSchema,
    OptimisticLockConflictResponseSchema,
    UnauthenticatedErrorResponseSchema,
} from "@/types/ApiType.ts";

const configDomain = "Notifications";

const ConfigEntryUiSchema = Type.Object({
    domain: Type.String(),
    key: Type.String(),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    type: Type.String(),
    value: Type.Any(),
    inputFormat: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    outputFormat: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    userProfile: Type.Boolean(),
    updatedAt: Type.String(),
});

// noinspection JSUnusedGlobalSymbols
export default function register(app: ApiInstance) {
    app.get(
        "/notifications/config",
        async ({ dbClient, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const entries: ConfigEntrySelectType[] = [];
            const keys = [
                "Enabled", "Notification schedule", "From", "Subject", "EmailTemplate", "BaseURL",
                "NotifyOnProvideData", "NotifyOnApprovalPending", "NotifyOnImporting", "NotifyOnDone", "NotifyOnCancelled",
            ];
            for (const key of keys) {
                const rows = await getConfigEntriesByKey(dbClient, configDomain, key, { limit: 1 });
                if (rows.length > 0) entries.push(rows[0]!);
            }

            return entries.map((e) => ({
                domain: e.domain,
                key: e.key,
                description: e.description,
                type: e.type,
                value: e.value,
                inputFormat: e.inputFormat,
                outputFormat: e.outputFormat,
                userProfile: e.userProfile,
                updatedAt: e.updatedAt,
            }));
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "Get notification config entries",
                description: "Returns all notification configuration entries. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                ],
            },
            response: {
                200: Type.Array(ConfigEntryUiSchema, { description: "All notification configuration entries in their UI representation." }),
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
            },
        },
    );

    app.put(
        "/notifications/config/:key",
        async ({ dbClient, params, body, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const key = decodeURIComponent(params.key);
            const rows = await getConfigEntriesByKey(dbClient, configDomain, key, { limit: 1 });
            if (rows.length === 0) return status(404, { error: "Not found" });

            const { value, knownUpdatedAt } = body as { value: unknown; knownUpdatedAt: string };

            const updated = await updateConfigEntry(dbClient, configDomain, key, value, knownUpdatedAt);
            if (updated.length === 0) {
                const [current] = await getConfigEntriesByKey(dbClient, configDomain, key, { limit: 1 });
                return status(409, { error: "Conflict: entry was modified by another session", currentValue: current?.value ?? null });
            }

            const result = updated[0]!;
            return {
                domain: result.domain,
                key: result.key,
                description: result.description,
                type: result.type,
                value: result.value,
                inputFormat: result.inputFormat,
                outputFormat: result.outputFormat,
                userProfile: result.userProfile,
                updatedAt: result.updatedAt,
            };
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "Update a notification config entry",
                description: "Updates a single notification config entry with optimistic locking. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                    {
                        name: "key",
                        description: "The notification configuration key to update.",
                        in: "path",
                        required: true,
                        schema: { type: "string" },
                    },
                ],
            },
            params: t.Object({
                key: t.String(),
            }),
            body: t.Object({
                value: t.Any(),
                knownUpdatedAt: t.String(),
            }),
            response: {
                200: {...ConfigEntryUiSchema, description: "The updated notification configuration entry."},
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
                 404: NotFoundErrorResponseSchema,
                 409: OptimisticLockConflictResponseSchema,
            },
        },
    );

    app.post(
        "/notifications/send",
        async ({ dbClient, body, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const { userIds, groupIds } = body as { userIds?: string[]; groupIds?: string[] };
            const sentTo = await sendToUser(dbClient, "", userIds, groupIds);
            return { sentTo };
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "Send notification digest out-of-sequence",
                description: "Triggers out-of-sequence delivery. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                ],
            },
            body: t.Object({
                userIds: t.Optional(t.Array(t.String())),
                groupIds: t.Optional(t.Array(t.String())),
            }),
            response: {
                200: Type.Object({ sentTo: Type.Any() }, { description: "The list of recipients the notification digest was sent to." }),
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
            },
        },
    );

    app.post(
        "/notifications/simulate",
        async ({ dbClient, body, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const { userId, groupId } = body as { userId?: string; groupId?: string };
            return await simulateEmail(dbClient, userId, groupId);
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "Simulate notification digest",
                description: "Generates a preview of the digest email for a user or group. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                ],
            },
            body: t.Object({
                userId: t.Optional(t.String()),
                groupId: t.Optional(t.String()),
            }),
            response: {
                200: Type.Any({ description: "The simulated notification digest email preview." }),
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
            },
        },
    );

    app.get(
        "/notifications/users",
        async ({ dbClient, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const users = await getUsers(dbClient, undefined, undefined, false);
            return users.map((u) => ({
                identifier: u.identifier,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
            }));
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "List users for notification target selection",
                description: "Returns all active users for the send/simulate user dropdowns. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                ],
            },
            response: {
                200: Type.Array(Type.Object({
                    identifier: Type.String({ format: "uuid" }),
                    firstName: Type.String(),
                    lastName: Type.String(),
                    email: Type.String(),
                }), { description: "All active users with identifier, first name, last name, and email." }),
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
            },
        },
    );

    app.get(
        "/notifications/groups",
        async ({ dbClient, session, tokenClaims }) => {
            const claims = session?.idTokenClaims ?? tokenClaims ?? {};
            const permissionCheck = await requirePermissions(dbClient, claims, [FP_NOTIFICATIONS]);
            if (!permissionCheck.ok) return permissionCheck.denial;

            const groups = await getGroups(dbClient, undefined, undefined, false);
            return groups.map((g) => ({
                identifier: g.identifier,
                groupName: g.groupName,
            }));
        },
        {
            detail: {
                tags: ["Notifications"],
                summary: "List groups for notification target selection",
                description: "Returns all active groups for the send/simulate group dropdowns. Requires FP_NOTIFICATIONS.",
                parameters: [
                    { name: "X-API-Key", in: "header", description: "API key used for authentication.", schema: { type: "string", example: "your-api-key" }, required: false },
                ],
            },
            response: {
                200: Type.Array(Type.Object({
                    identifier: Type.String({ format: "uuid" }),
                    groupName: Type.String(),
                }), { description: "All active groups with identifier and group name." }),
                 401: UnauthenticatedErrorResponseSchema,
                 403: ForbiddenErrorResponseSchema,
            },
        },
    );
}
