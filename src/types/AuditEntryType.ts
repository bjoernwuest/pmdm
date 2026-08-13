// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {AuditEntrySchemaSelectSchema as _AuditEntrySchemaSelectSchema, AuditEntrySchemaInsertSchema as _AuditEntrySchemaInsertSchema} from "@/types/_AuditEntryType.ts";
import {type Static, Type} from "@sinclair/typebox";

export * from './_AuditEntryType.ts';

// Redefine schema and types to address $type() on entity column
const payloadSchema = Type.Record(Type.String(), Type.Any());

export const AuditEntrySchemaSelectSchema = Type.Composite([
    Type.Omit(_AuditEntrySchemaSelectSchema, ["payload"]),
    Type.Object({payload: payloadSchema}),
]);
export type AuditEntrySchemaSelectType = Static<typeof AuditEntrySchemaSelectSchema>;

export const AuditEntrySchemaInsertSchema = Type.Composite([
    Type.Omit(_AuditEntrySchemaInsertSchema, ["payload"]),
    Type.Object({payload: payloadSchema}),
]);
export type AuditEntrySchemaInsertType = Static<typeof AuditEntrySchemaInsertSchema>;


export const AuditLogResponseSchema = Type.Object({
    entries: Type.Array(AuditEntrySchemaSelectSchema),
    page: Type.Number(),
    pageSize: Type.Number(),
    total: Type.Number(),
}, { description: "Paginated audit log entries with page metadata." });
export type AuditLogResponse = Static<typeof AuditLogResponseSchema>;

export const AuditLogClearResponseSchema = Type.Object({ success: Type.Boolean(), deletedCount: Type.Number() }, { description: "Confirmation with the number of deleted audit log entries." });
export type AuditLogClearResponse = Static<typeof AuditLogClearResponseSchema>;
