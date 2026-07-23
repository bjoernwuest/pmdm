import type { InputFormatter } from './types';

/**
 * Constrains input to a valid UUID v4 format.
 * Only allows hex characters [0-9a-fA-F], auto-inserts hyphens at
 * positions 8, 13, 18, and 23, and limits input to 36 characters total.
 */
export const uuidFormatter: InputFormatter = (value, _component, _event) => {
  // Strip all non-hex characters, keep hyphens for cursor-friendly editing
  const stripped = value.replace(/[^0-9a-fA-F-]/g, '');

  // Remove all hyphens, then re-insert at correct positions
  const hexOnly = stripped.replace(/-/g, '');

  // Limit to 32 hex characters
  const limited = hexOnly.slice(0, 32);

  let result = '';
  for (let i = 0; i < limited.length; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      result += '-';
    }
    result += limited[i]!.toUpperCase();
  }

  return result;
};
