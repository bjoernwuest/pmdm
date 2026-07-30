// AUTO-GENERATED — DO NOT EDIT

import { Type, type Static } from '@sinclair/typebox';
import { Nullable } from './helpers.ts';

/**
 * Enum representing the various types of configuration values.
 * This is used to define the expected data type for configuration settings.
 *
 * The following value types are available:
 * - `string`: Represents a single string value.
 * - `number`: Represents a single numeric value.
 * - `boolean`: Represents a single boolean value.
 * - `object`: Represents a single object.
 * - `string[]`: Represents an array of string values.
 * - `number[]`: Represents an array of numeric values.
 */
export const ConfigValueTypes = {
    string: 'string' as const,
    number: 'number' as const,
    boolean: 'boolean' as const,
    object: 'object' as const,
    'string[]': 'string[]' as const,
    'number[]': 'number[]' as const,
}

export type ConfigValueTypes = typeof ConfigValueTypes[keyof typeof ConfigValueTypes];

export const ConfigEntrySelectSchema = Type.Object({
  domain: Type.String({ maxLength: 255 }),
  key: Type.String({ maxLength: 255 }),
  description: Type.Optional(Nullable(Type.String())),
  type: Type.String(),
  value: Type.Optional(Nullable(Type.Unknown())),
  editInUI: Type.Boolean(),
  formatRegex: Type.String(),
  inputFormat: Type.String(),
  outputFormat: Type.String(),
  mandatoryForStart: Type.Boolean(),
  userProfile: Type.Boolean(),
});
export type ConfigEntrySelectType = Static<typeof ConfigEntrySelectSchema>;

export const ConfigEntryInsertSchema = Type.Object({
  domain: Type.String({ maxLength: 255 }),
  key: Type.String({ maxLength: 255 }),
  description: Type.Optional(Nullable(Type.String())),
  type: Type.String(),
  value: Type.Optional(Nullable(Type.Unknown())),
  editInUI: Type.Optional(Type.Boolean()),
  formatRegex: Type.Optional(Type.String()),
  inputFormat: Type.Optional(Type.String()),
  outputFormat: Type.Optional(Type.String()),
  mandatoryForStart: Type.Optional(Type.Boolean()),
  userProfile: Type.Optional(Type.Boolean()),
});
export type ConfigEntryInsertType = Static<typeof ConfigEntryInsertSchema>;
