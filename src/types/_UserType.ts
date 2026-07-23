// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';

export const GroupSelectSchema = Type.Object({
  groupName: Type.String(),
  disabled: Type.Boolean(),
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type GroupSelectType = Static<typeof GroupSelectSchema>;

export const GroupInsertSchema = Type.Object({
  groupName: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});
export type GroupInsertType = Static<typeof GroupInsertSchema>;

export const UserSelectSchema = Type.Object({
  firstName: Type.String(),
  lastName: Type.String(),
  email: Type.String(),
  disabled: Type.Boolean(),
  identifier: Type.String({ format: 'uuid' }),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type UserSelectType = Static<typeof UserSelectSchema>;

export const UserInsertSchema = Type.Object({
  firstName: Type.String(),
  lastName: Type.String(),
  email: Type.String(),
  disabled: Type.Optional(Type.Boolean()),
  identifier: Type.Optional(Type.String({ format: 'uuid' })),
  createdAt: Type.Optional(Type.String()),
  updatedAt: Type.Optional(Type.String()),
});
export type UserInsertType = Static<typeof UserInsertSchema>;

export const UserGroupSelectSchema = Type.Object({
  userIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
});
export type UserGroupSelectType = Static<typeof UserGroupSelectSchema>;

export const UserGroupInsertSchema = Type.Object({
  userIdentifier: Type.String({ format: 'uuid' }),
  groupIdentifier: Type.String({ format: 'uuid' }),
});
export type UserGroupInsertType = Static<typeof UserGroupInsertSchema>;
