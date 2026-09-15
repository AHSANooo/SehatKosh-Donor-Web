export interface PiiDetectionResult {
  hasPii: boolean;
  cnicMatches: number;
  phoneMatches: number;
  nameMatches: number;
  totalMatches: number;
  previewText: string;
}

const CNIC_REGEX = /\b\d{5}[-]?\d{7}[-]?\d{1}\b/g;
const PHONE_REGEX = /(\+92|0)?3\d{2}[-\s]?\d{7}\b/g;
const NAME_REGEX = /\b(dr|doctor|patient|mr|mrs|ms)\.?\s+[a-zA-Z]+/gi;

export function analyzePii(text: string): PiiDetectionResult {
  const cnicMatches = (text.match(CNIC_REGEX) || []).length;
  const phoneMatches = (text.match(PHONE_REGEX) || []).length;
  const nameMatches = (text.match(NAME_REGEX) || []).length;
  const totalMatches = cnicMatches + phoneMatches + nameMatches;

  let previewText = text
    .replace(CNIC_REGEX, '[REDACTED_CNIC]')
    .replace(PHONE_REGEX, '[REDACTED_PHONE]')
    .replace(NAME_REGEX, '[REDACTED_NAME]');

  return {
    hasPii: totalMatches > 0,
    cnicMatches,
    phoneMatches,
    nameMatches,
    totalMatches,
    previewText,
  };
}
