// This file is scaffolded ONCE by scripts/generator.ts. It is safe to extend
// with hand-written exports (additional TypeBox schemas, types, constants, ...) —
// the generator only creates this file if it is missing; it will never
// overwrite or delete anything you add here afterwards.
import {TAG_CREATE, TAG_DISABLE, TAG_UPDATE, type Tag} from "./PubSubType";

export * from './_BusinessDomainType.ts';

/** Resource tag for BusinessDomain. */
export const TAG_BUSINESS_DOMAIN = "business_domain" as const;

/** PubSub topic for business-domain disable events. */
export const message_DisableBusinessDomain: Tag[] = [TAG_BUSINESS_DOMAIN, TAG_DISABLE];
/** PubSub topic for business-domain update events. */
export const message_UpdateBusinessDomain: Tag[] = [TAG_BUSINESS_DOMAIN, TAG_UPDATE];
/** PubSub topic for business-domain create events. */
export const message_CreateBusinessDomain: Tag[] = [TAG_BUSINESS_DOMAIN, TAG_CREATE];