import { UserProfileConfigSelectSchema as _UserProfileConfigSelectSchema, UserProfileConfigInsertSchema as _UserProfileConfigInsertSchema } from "@/types/_UserProfileConfigType.ts";
import { type Static, Type } from "@sinclair/typebox";
import { Nullable } from "./helpers.ts";

export * from './_UserProfileConfigType.ts';

export const UserProfileConfigSelectSchema = Type.Composite([
    Type.Omit(_UserProfileConfigSelectSchema, []),
]);
export type UserProfileConfigSelectType = Static<typeof UserProfileConfigSelectSchema>;

export const UserProfileConfigInsertSchema = Type.Composite([
    Type.Omit(_UserProfileConfigInsertSchema, []),
]);
export type UserProfileConfigInsertType = Static<typeof UserProfileConfigInsertSchema>;
