import type { InputFormatter } from './types';

/**
 * Formats numeric input as a percentage (e.g., "12.5" → "12.5%").
 * Constrains values to the 0–100 range with up to two decimal places.
 */
export const percentageFormatter: InputFormatter = (value, _component, _event) => {
  let cleaned = value.replace(/[^\d.]/g, '');

  // Ensure at most one decimal point
  const dotIndex = cleaned.indexOf('.');
  if (dotIndex !== -1) {
    cleaned =
      cleaned.slice(0, dotIndex + 1) +
      cleaned.slice(dotIndex + 1).replace(/\./g, '');
  }

  const num = parseFloat(cleaned);
  if (isNaN(num) || num <= 0) return cleaned === '' ? '' : '0%';
  if (num > 100) return '100%';

  const [intPart = '', decPart = ''] = cleaned.split('.');
  const formattedDec = decPart.slice(0, 2);

  if (formattedDec.length > 0 || cleaned.includes('.')) {
    return `${Number(intPart)}.${formattedDec}%`;
  }
  return `${Number(intPart)}%`;
};
