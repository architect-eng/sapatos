import { describe, it, expect } from 'vitest';
import { sourceFilesForCustomTypes, generateBarrelContent, indentAll } from './tsOutput';

describe('tsOutput.ts', () => {
  describe('sourceFilesForCustomTypes', () => {
    it('should return empty object for no custom types', () => {
      const result = sourceFilesForCustomTypes({});
      expect(result).toEqual({});
    });

    it('should generate placeholder file for any type', () => {
      const result = sourceFilesForCustomTypes({
        PgMyCustomType: 'any',
      });

      expect(result.PgMyCustomType).toBeDefined();
      expect(result.PgMyCustomType).toContain('export type PgMyCustomType = any;');
      expect(result.PgMyCustomType).toContain("Please edit this file as needed");
    });

    it('should include db import for JSONValue base type', () => {
      const result = sourceFilesForCustomTypes({
        PgJsonDomain: 'db.JSONValue',
      });

      expect(result.PgJsonDomain).toContain("import type * as db from '@architect-eng/sapatos/db';");
      expect(result.PgJsonDomain).toContain('export type PgJsonDomain = db.JSONValue;');
    });

    it('should not include db import for non-JSONValue types', () => {
      const result = sourceFilesForCustomTypes({
        PgTextDomain: 'string',
      });

      expect(result.PgTextDomain).not.toContain("import type * as db");
      expect(result.PgTextDomain).toContain('export type PgTextDomain = string;');
    });

    it('should handle multiple custom types', () => {
      const result = sourceFilesForCustomTypes({
        PgType1: 'any',
        PgType2: 'string',
        PgType3: 'db.JSONValue',
      });

      expect(Object.keys(result)).toHaveLength(3);
      expect(result.PgType1).toBeDefined();
      expect(result.PgType2).toBeDefined();
      expect(result.PgType3).toBeDefined();
    });
  });

  describe('generateBarrelContent', () => {
    it('should return empty string for no custom types', () => {
      const result = generateBarrelContent([]);
      expect(result).toBe('');
    });

    it('should generate export for single custom type', () => {
      const result = generateBarrelContent(['PgMyType']);
      expect(result).toBe("export * from './PgMyType';\n");
    });

    it('should generate exports for multiple custom types', () => {
      const result = generateBarrelContent(['PgType1', 'PgType2', 'PgType3']);
      expect(result).toBe(
        "export * from './PgType1';\n" +
        "export * from './PgType2';\n" +
        "export * from './PgType3';\n"
      );
    });

    it('should handle custom type names with underscores', () => {
      const result = generateBarrelContent(['PgEmail_address', 'PgCompany_id']);
      expect(result).toContain("export * from './PgEmail_address';");
      expect(result).toContain("export * from './PgCompany_id';");
    });
  });

  describe('indentAll', () => {
    it('should return unchanged string for level 0', () => {
      const input = 'line1\nline2\nline3';
      expect(indentAll(0, input)).toBe(input);
    });

    it('should indent single line', () => {
      expect(indentAll(2, 'hello')).toBe('  hello');
    });

    it('should indent all lines', () => {
      const input = 'line1\nline2\nline3';
      const expected = '  line1\n  line2\n  line3';
      expect(indentAll(2, input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(indentAll(2, '')).toBe('  ');
    });

    it('should indent by specified number of spaces', () => {
      expect(indentAll(4, 'test')).toBe('    test');
    });

    it('should preserve existing indentation', () => {
      const input = '  already indented';
      expect(indentAll(2, input)).toBe('    already indented');
    });
  });
});
