import { describe, it, expect } from 'vitest';
import { test } from '@fast-check/vitest';
import * as fc from 'fast-check';
import { validateICD10, validateFutureDatetime } from '@/utils/validationUtils';

// ─── Unit tests ───────────────────────────────────────────────────────────────

describe('validateICD10', () => {
  it('accepts a simple 3-character code', () => {
    expect(validateICD10('A01')).toBe(true);
  });

  it('accepts a code with a decimal extension', () => {
    expect(validateICD10('B12.3')).toBe(true);
  });

  it('accepts a code with a 4-character extension', () => {
    expect(validateICD10('Z99.AB12')).toBe(true);
  });

  it('accepts a code with a 1-character extension', () => {
    expect(validateICD10('C34.1')).toBe(true);
  });

  it('rejects a code starting with a lowercase letter', () => {
    expect(validateICD10('a01')).toBe(false);
  });

  it('rejects a code with only 1 digit', () => {
    expect(validateICD10('A1')).toBe(false);
  });

  it('rejects a code with letters in the digit positions', () => {
    expect(validateICD10('AAA')).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(validateICD10('')).toBe(false);
  });

  it('rejects a code with a dot but no extension', () => {
    expect(validateICD10('A01.')).toBe(false);
  });

  it('rejects a code with a 5-character extension', () => {
    expect(validateICD10('A01.12345')).toBe(false);
  });

  it('rejects a code with lowercase in the extension', () => {
    expect(validateICD10('A01.abc')).toBe(false);
  });
});

// ─── Arbitrary: valid ICD-10 code generator ───────────────────────────────────

/**
 * Generates valid ICD-10 codes matching ^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$
 */

// Arbitrary for a single character in [0-9A-Z]
const alphanumUpperChar = fc
  .oneof(
    fc.integer({ min: 48, max: 57 }), // '0'-'9'
    fc.integer({ min: 65, max: 90 }) // 'A'-'Z'
  )
  .map((n) => String.fromCharCode(n));

// Arbitrary for a 1–4 character extension string using [0-9A-Z]
const extensionArbitrary = fc
  .array(alphanumUpperChar, { minLength: 1, maxLength: 4 })
  .map((chars) => chars.join(''));

const validICD10Arbitrary = fc.oneof(
  // Without decimal extension: [A-Z][0-9]{2}
  fc
    .tuple(
      fc.integer({ min: 65, max: 90 }).map((n) => String.fromCharCode(n)), // A-Z
      fc.integer({ min: 0, max: 9 }).map(String),
      fc.integer({ min: 0, max: 9 }).map(String)
    )
    .map(([letter, d1, d2]) => `${letter}${d1}${d2}`),

  // With decimal extension: [A-Z][0-9]{2}.[0-9A-Z]{1,4}
  fc
    .tuple(
      fc.integer({ min: 65, max: 90 }).map((n) => String.fromCharCode(n)), // A-Z
      fc.integer({ min: 0, max: 9 }).map(String),
      fc.integer({ min: 0, max: 9 }).map(String),
      extensionArbitrary
    )
    .map(([letter, d1, d2, ext]) => `${letter}${d1}${d2}.${ext}`)
);

/**
 * Property 2: ICD-10 Validation Correctness
 * Validates: Requirements 6.3
 *
 * For any string, validateICD10 returns true iff it matches the pattern.
 */
test.prop([fc.string()], { numRuns: 20 })(
  'validateICD10 returns true iff string matches ICD-10 pattern',
  (code) => {
    const pattern = /^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/;
    const expected = pattern.test(code);
    expect(validateICD10(code)).toBe(expected);
  }
);

/**
 * Property 3: ICD-10 Validation Idempotence
 * Validates: Requirements 12.3
 *
 * For any valid ICD-10 code, calling validateICD10 twice returns the same result.
 */
test.prop([validICD10Arbitrary], { numRuns: 20 })(
  'validateICD10 is idempotent: validateICD10(s) === validateICD10(s)',
  (code) => {
    const first = validateICD10(code);
    const second = validateICD10(code);
    expect(first).toBe(second);
    // Valid codes must return true
    expect(first).toBe(true);
  }
);

// ─── Property 11: Future Datetime Rejection ───────────────────────────────────

/**
 * Property 11: Future Datetime Rejection
 * Validates: Requirements 6.4, 6.10
 *
 * For any datetime value, if the datetime is in the future (greater than the current moment),
 * validateFutureDatetime SHALL return false. All past and present datetimes SHALL return true.
 */
test.prop([fc.date({ noInvalidDate: true })], { numRuns: 20 })(
  'validateFutureDatetime rejects future dates, accepts past/present',
  (date) => {
    const now = new Date();
    const result = validateFutureDatetime(date);

    // If date is in the future, result must be false
    if (date > now) {
      expect(result).toBe(false);
    } else {
      // If date is in the past or present, result must be true
      expect(result).toBe(true);
    }
  }
);

/**
 * Property 11: Future Datetime Rejection - Boundary tests
 * Validates: Requirements 6.4, 6.10
 *
 * Verifies exact boundary behavior at current time.
 */
test.prop([
  fc.integer({ min: -1000, max: 1000 }).map((offsetMs) => {
    const now = new Date();
    return new Date(now.getTime() + offsetMs);
  }),
], { numRuns: 20 })(
  'validateFutureDatetime boundary: now and immediate past/future',
  (date) => {
    const now = new Date();
    const result = validateFutureDatetime(date);

    // Exact current time should be accepted (not future)
    const diff = date.getTime() - now.getTime();
    if (diff <= 0) {
      expect(result).toBe(true);
    } else {
      expect(result).toBe(false);
    }
  }
);
