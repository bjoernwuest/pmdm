// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {TAG_CREATE, TAG_DISABLE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from './_TargetSystemType.ts';

/** Resource tag for TargetSystem. */
export const TAG_TARGET_SYSTEM = "target_system" as const;

/** PubSub topic for target-system disable events. */
export const message_DisableTargetSystem: Tag[] = [TAG_TARGET_SYSTEM, TAG_DISABLE];
/** PubSub topic for target-system update events. */
export const message_UpdateTargetSystem: Tag[] = [TAG_TARGET_SYSTEM, TAG_UPDATE];
/** PubSub topic for target-system create events. */
export const message_CreateTargetSystem: Tag[] = [TAG_TARGET_SYSTEM, TAG_CREATE];