import type { InputFormatter } from './types';

/**
 * Strips all non-digit characters, allowing only [0-9].
 */
export const digitsFormatter: InputFormatter = (value, _component, _event) => {
  return value.replace(/\D/g, '');
};
