import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recursivelyInterpolateEnvVars } from './cli';

describe('cli.ts', () => {
  describe('recursivelyInterpolateEnvVars', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should interpolate environment variables in strings', () => {
      process.env['TEST_VAR'] = 'test_value';
      const result = recursivelyInterpolateEnvVars('prefix_{{ TEST_VAR }}_suffix');
      expect(result).toBe('prefix_test_value_suffix');
    });

    it('should handle multiple variables in one string', () => {
      process.env['VAR1'] = 'hello';
      process.env['VAR2'] = 'world';
      const result = recursivelyInterpolateEnvVars('{{ VAR1 }} {{ VAR2 }}');
      expect(result).toBe('hello world');
    });

    it('should handle whitespace around variable names', () => {
      process.env['MY_VAR'] = 'value';
      const result = recursivelyInterpolateEnvVars('{{  MY_VAR  }}');
      expect(result).toBe('value');
    });

    it('should throw for undefined environment variables', () => {
      delete process.env['UNDEFINED_VAR'];
      expect(() => recursivelyInterpolateEnvVars('{{ UNDEFINED_VAR }}')).toThrow(
        "Environment variable 'UNDEFINED_VAR' is not set"
      );
    });

    it('should recursively process arrays', () => {
      process.env['ITEM'] = 'processed';
      const result = recursivelyInterpolateEnvVars(['{{ ITEM }}', 'static', '{{ ITEM }}']);
      expect(result).toEqual(['processed', 'static', 'processed']);
    });

    it('should recursively process objects', () => {
      process.env['HOST'] = 'localhost';
      process.env['PORT'] = '5432';
      const result = recursivelyInterpolateEnvVars({
        db: {
          host: '{{ HOST }}',
          port: '{{ PORT }}',
        },
      });
      expect(result).toEqual({
        db: {
          host: 'localhost',
          port: '5432',
        },
      });
    });

    it('should pass through numbers unchanged', () => {
      const result = recursivelyInterpolateEnvVars(42);
      expect(result).toBe(42);
    });

    it('should pass through booleans unchanged', () => {
      const result = recursivelyInterpolateEnvVars(true);
      expect(result).toBe(true);
    });

    it('should pass through null unchanged', () => {
      const result = recursivelyInterpolateEnvVars(null);
      expect(result).toBe(null);
    });

    it('should handle strings without variables', () => {
      const result = recursivelyInterpolateEnvVars('no variables here');
      expect(result).toBe('no variables here');
    });

    it('should handle empty strings', () => {
      const result = recursivelyInterpolateEnvVars('');
      expect(result).toBe('');
    });

    it('should handle deeply nested structures', () => {
      process.env['DEEP'] = 'found';
      const result = recursivelyInterpolateEnvVars({
        level1: {
          level2: {
            level3: ['{{ DEEP }}'],
          },
        },
      });
      expect(result).toEqual({
        level1: {
          level2: {
            level3: ['found'],
          },
        },
      });
    });
  });
});
