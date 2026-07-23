import type { InputFormatter } from './types';

/**
 * Filters keystrokes to allow only valid numeric partial-input characters:
 * optional leading '-', digits 0-9, and at most one '.' decimal separator.
 */
export const numericFormatter: InputFormatter = (value, _component, _event) => {
  // Remove any character that isn't a digit, minus, or dot
  let filtered = value.replace(/[^0-9.\-]/g, '');

  // Ensure at most one leading minus sign
  const minusCount = (filtered.match(/-/g) || []).length;
  if (minusCount > 1) {
    filtered = filtered.replace(/-/g, '');
    filtered = '-' + filtered;
  }
  // Minus must be at the start
  if (minusCount === 1 && filtered.indexOf('-') !== 0) {
    filtered = filtered.replace('-', '');
    filtered = '-' + filtered;
  }

  // At most one decimal point
  const firstDot = filtered.indexOf('.');
  if (firstDot !== -1) {
    filtered = filtered.substring(0, firstDot + 1) +
      filtered.substring(firstDot + 1).replace(/\./g, '');
  }

  return filtered;
};
