import {t} from "elysia";
import {type Static, Type} from "@sinclair/typebox";
import {ConsumablesSelectSchema} from "@/types/_ConsumableType.ts";
import {TAG_CREATE, TAG_DISABLE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from "./_ConsumableType.ts";

/** Resource tag for Consumable. */
export const TAG_CONSUMABLE = "consumable" as const;
/** Resource tag for ConsumableValue. */
export const TAG_CONSUMABLE_VALUE = "consumable_value" as const;

/** PubSub topic for consumable disable events. */
export const message_DisableConsumable: Tag[] = [TAG_CONSUMABLE, TAG_DISABLE];
/** PubSub topic for consumable update events. */
export const message_UpdateConsumable: Tag[] = [TAG_CONSUMABLE, TAG_UPDATE];
/** PubSub topic for consumable create events. */
export const message_CreateConsumable: Tag[] = [TAG_CONSUMABLE, TAG_CREATE];

/** PubSub topic for consumable-value disable events. */
export const message_DisableConsumableValue: Tag[] = [TAG_CONSUMABLE_VALUE, TAG_DISABLE];
/** PubSub topic for consumable-value update events. */
export const message_UpdateConsumableValue: Tag[] = [TAG_CONSUMABLE_VALUE, TAG_UPDATE];
/** PubSub topic for consumable-value create events. */
export const message_CreateConsumableValue: Tag[] = [TAG_CONSUMABLE_VALUE, TAG_CREATE];

/** Summary payload schema combining a consumable with value counters. */
export const ConsumableSummarySchema = t.Object({
    consumable: ConsumablesSelectSchema,
    enabledValueCount: t.Number({ minimum: 0 }),
    disabledValueCount: t.Number({ minimum: 0 }),
    usedValueCount: t.Number({ minimum: 0 }),
});
export type ConsumableSummarySchemaType = Static<typeof ConsumableSummarySchema>;
