// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {LookupsSchemaSelectSchema} from "@/types/_LookupsType.ts";
import {type Static, Type} from "@sinclair/typebox";
import {TAG_CREATE, TAG_DISABLE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from './_LookupsType.ts';

/** Resource tag for Lookup. */
export const TAG_LOOKUP = "lookup" as const;
/** Resource tag for LookupValue. */
export const TAG_LOOKUP_VALUE = "lookup_value" as const;

/** PubSub topic for lookup disable events. */
export const message_DisableLookup: Tag[] = [TAG_LOOKUP, TAG_DISABLE];
/** PubSub topic for lookup update events. */
export const message_UpdateLookup: Tag[] = [TAG_LOOKUP, TAG_UPDATE];
/** PubSub topic for lookup create events. */
export const message_CreateLookup: Tag[] = [TAG_LOOKUP, TAG_CREATE];

/** PubSub topic for lookup-value disable events. */
export const message_DisableLookupValue: Tag[] = [TAG_LOOKUP_VALUE, TAG_DISABLE];
/** PubSub topic for lookup-value update events. */
export const message_UpdateLookupValue: Tag[] = [TAG_LOOKUP_VALUE, TAG_UPDATE];
/** PubSub topic for lookup-value create events. */
export const message_CreateLookupValue: Tag[] = [TAG_LOOKUP_VALUE, TAG_CREATE];

/** Summary payload schema combining a lookup with value counters. */
export const LookupSummarySchema = Type.Object({
    lookup: LookupsSchemaSelectSchema,
    enabledValueCount: Type.Number({ minimum: 0 }),
    disabledValueCount: Type.Number({ minimum: 0 }),
});
export type LookupSummarySchemaType = Static<typeof LookupSummarySchema>;
