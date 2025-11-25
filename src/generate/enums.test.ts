import { describe, it, expect } from 'vitest';
import { enumTypesForEnumData, type EnumData } from './enums';

describe('enums.ts', () => {
  describe('enumTypesForEnumData', () => {
    it('should generate empty string for empty enum data', () => {
      const result = enumTypesForEnumData({});
      expect(result).toBe('');
    });

    it('should generate type definition for single enum', () => {
      const enums: EnumData = {
        status: ['active', 'inactive', 'pending'],
      };
      const result = enumTypesForEnumData(enums);

      expect(result).toContain("export type status = 'active' | 'inactive' | 'pending';");
      expect(result).toContain("export namespace every {");
      expect(result).toContain("export type status = ['active', 'inactive', 'pending'];");
    });

    it('should generate type definitions for multiple enums', () => {
      const enums: EnumData = {
        status: ['active', 'inactive'],
        priority: ['low', 'medium', 'high'],
      };
      const result = enumTypesForEnumData(enums);

      expect(result).toContain("export type status = 'active' | 'inactive';");
      expect(result).toContain("export type priority = 'low' | 'medium' | 'high';");
    });

    it('should handle enum with single value', () => {
      const enums: EnumData = {
        singleton: ['only_value'],
      };
      const result = enumTypesForEnumData(enums);

      expect(result).toContain("export type singleton = 'only_value';");
      expect(result).toContain("export type singleton = ['only_value'];");
    });

    it('should handle enum values with special characters', () => {
      const enums: EnumData = {
        weird: ['has-dash', 'has_underscore', 'has space'],
      };
      const result = enumTypesForEnumData(enums);

      expect(result).toContain("'has-dash'");
      expect(result).toContain("'has_underscore'");
      expect(result).toContain("'has space'");
    });
  });
});
