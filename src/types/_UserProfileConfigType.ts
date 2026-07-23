// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

export const UserProfileConfigSelectSchema = Type.Object({
  domain: Type.String({ maxLength: 255 }),
  key: Type.String({ maxLength: 255 }),
  userIdentifier: Type.String({ format: 'uuid' }),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type UserProfileConfigSelectType = Static<typeof UserProfileConfigSelectSchema>;

export const UserProfileConfigInsertSchema = Type.Object({
  domain: Type.String({ maxLength: 255 }),
  key: Type.String({ maxLength: 255 }),
  userIdentifier: Type.String({ format: 'uuid' }),
  value: Type.Optional(Nullable(Type.Unknown())),
});
export type UserProfileConfigInsertType = Static<typeof UserProfileConfigInsertSchema>;
