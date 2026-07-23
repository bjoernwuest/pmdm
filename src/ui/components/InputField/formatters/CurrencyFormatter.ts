import type { InputFormatter } from './types';

/**
 * Formats numeric input as currency (e.g., "1234.5" → "1,234.50").
 * Strips non-numeric characters except the decimal point, then formats with
 * thousands separators and two decimal places.
 */
export const currencyFormatter: InputFormatter = (value, _component, _event) => {
  let cleaned = value.replace(/[^\d.]/g, '');

  // Ensure at most one decimal point
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex !== -1) {
    cleaned =
      cleaned.slice(0, dotIndex + 1) +
      cleaned.slice(dotIndex + 1).replace(/\./g, '');
  }

  const [intPart = '', decPart = ''] = cleaned.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const formattedDec = decPart.slice(0, 2);

  if (formattedDec.length > 0 || cleaned.includes('.')) {
    return `${formattedInt}.${formattedDec}`;
  }
  return formattedInt;
};
