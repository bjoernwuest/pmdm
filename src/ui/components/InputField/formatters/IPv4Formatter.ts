import type { InputFormatter } from './types';

/**
 * Constrains input to a valid IPv4 address format.
 * Only allows digits and dots, constrains each octet to 0–255,
 * and limits input to four octets (three dots).
 */
export const ipv4Formatter: InputFormatter = (value, _component, _event) => {
  // Only allow digits and dots
  let cleaned = value.replace(/[^\d.]/g, '');

  // Remove consecutive dots
  cleaned = cleaned.replace(/\.{2,}/g, '.');

  const parts = cleaned.split('.');

  // Limit to 4 octets
  if (parts.length > 4) {
    parts.length = 4;
  }

  const constrained = parts.map((part) => {
    if (part === '') return '';

    // Remove leading zeros (except for "0" itself)
    let sanitized = part;
    if (sanitized.length > 1 && sanitized.startsWith('0')) {
      sanitized = sanitized.replace(/^0+/, '') || '0';
    }

    const num = parseInt(sanitized, 10);
    if (isNaN(num)) return '';

    if (num > 255) return '255';

    return String(num);
  });

  return constrained.join('.');
};
