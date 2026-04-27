/**
 * Validates an ICD-10 code against the standard pattern.
 * Valid format: one uppercase letter, two digits, optionally followed by
 * a dot and 1–4 alphanumeric characters (uppercase letters or digits).
 *
 * Examples of valid codes: "A01", "B12.3", "Z99.AB12"
 */
export function validateICD10(code: string): boolean {
  const pattern = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
  return pattern.test(code);
}

/**
 * Validates that a datetime is not in the future.
 * Returns true if the datetime is in the past or present, false if in the future.
 */
export function validateFutureDatetime(datetime: Date): boolean {
  const now = new Date();
  return datetime <= now;
}
