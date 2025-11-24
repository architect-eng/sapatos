import { describe, it, expect } from 'vitest';
import { header } from './header';

describe('header Module', () => {
  describe('header', () => {
    it('returns string with DO NOT EDIT warning', () => {
      const result = header();
      expect(result).toContain('DO NOT EDIT');
      expect(result).toContain('CRITICAL');
    });

    it('includes Sapatos branding', () => {
      const result = header();
      expect(result).toContain('Sapatos');
    });

    it('returns same string every time (pure function)', () => {
      const first = header();
      const second = header();
      expect(first).toBe(second);
      expect(first).toEqual(second);
    });
  });
});
