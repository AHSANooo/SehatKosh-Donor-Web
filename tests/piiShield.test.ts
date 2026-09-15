import { describe, it, expect } from 'vitest';
import { analyzePii } from '../src/components/piiShield';

describe('PII Shield Analysis', () => {
  it('detects and redacts Pakistani CNIC with dashes', () => {
    const text = 'Patient CNIC: 35201-1234567-1 prescribed Paracetamol.';
    const result = analyzePii(text);
    expect(result.hasPii).toBe(true);
    expect(result.cnicMatches).toBe(1);
    expect(result.previewText).toContain('[REDACTED_CNIC]');
    expect(result.previewText).not.toContain('35201-1234567-1');
  });

  it('detects and redacts Pakistani CNIC without dashes', () => {
    const text = 'Record CNIC 3520112345671 for review.';
    const result = analyzePii(text);
    expect(result.hasPii).toBe(true);
    expect(result.cnicMatches).toBe(1);
    expect(result.previewText).toContain('[REDACTED_CNIC]');
  });

  it('detects and redacts Pakistani mobile phone numbers', () => {
    const text = 'Emergency contact: 0300-1234567 or +923217654321.';
    const result = analyzePii(text);
    expect(result.hasPii).toBe(true);
    expect(result.phoneMatches).toBe(2);
    expect(result.previewText).toContain('[REDACTED_PHONE]');
    expect(result.previewText).not.toContain('0300-1234567');
  });

  it('detects and redacts clinician and patient names', () => {
    const text = 'Prescribed by Dr. Ahsan for Patient Usman. Tab Panadol 500mg.';
    const result = analyzePii(text);
    expect(result.hasPii).toBe(true);
    expect(result.nameMatches).toBe(2);
    expect(result.previewText).toContain('[REDACTED_NAME]');
    expect(result.previewText).not.toContain('Dr. Ahsan');
    expect(result.previewText).not.toContain('Patient Usman');
  });

  it('returns hasPii false when text contains only medication details', () => {
    const text = 'Tab. Augmentin 625mg 1 tab BD x 5 days.\nSyp. Brufen 2 tsp TDS.';
    const result = analyzePii(text);
    expect(result.hasPii).toBe(false);
    expect(result.totalMatches).toBe(0);
    expect(result.previewText).toBe(text);
  });
});
