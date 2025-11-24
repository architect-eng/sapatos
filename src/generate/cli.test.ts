import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validConfigs, invalidConfigs, testEnvVars } from './__fixtures__/cli-fixtures';
import { mockProcessEnv } from './__test-helpers__/mock-helpers';
import { recursivelyInterpolateEnvVars, runCLI } from './cli';

// Mock implementations - use vi.hoisted() to make them available during mock hoisting
const { mockExistsSync, mockReadFileSync, mockGenerate } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockGenerate: vi.fn(),
}));

// Mock modules at top level (hoisted)
vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock('./index', () => ({
  generate: mockGenerate,
}));

describe('CLI Module', () => {
  describe('recursivelyInterpolateEnvVars', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv(testEnvVars);
    });

    afterEach(() => {
      restoreEnv();
    });

    describe('String Interpolation', () => {
      it('interpolates single env var: "{{ DB_HOST }}" → "localhost"', () => {
        const result = recursivelyInterpolateEnvVars('{{ DB_HOST }}');
        expect(result).toBe('localhost');
      });

      it('interpolates multiple vars: "{{ DB_USER }}:{{ DB_PASS }}" → "admin:secret123"', () => {
        const result = recursivelyInterpolateEnvVars('{{ DB_USER }}:{{ DB_PASS }}');
        expect(result).toBe('admin:secret123');
      });

      it('interpolates with whitespace: "{{  DB_HOST  }}" → "localhost"', () => {
        const result = recursivelyInterpolateEnvVars('{{  DB_HOST  }}');
        expect(result).toBe('localhost');
      });

      it('preserves non-matching braces: "{ not_a_var }" → "{ not_a_var }"', () => {
        const result = recursivelyInterpolateEnvVars('{ not_a_var }');
        expect(result).toBe('{ not_a_var }');
      });

      it('handles empty string values', () => {
        process.env.EMPTY_VAR = '';
        const result = recursivelyInterpolateEnvVars('value:{{ EMPTY_VAR }}');
        expect(result).toBe('value:');
      });

      it('handles numeric-looking string values', () => {
        process.env.PORT = '5432';
        const result = recursivelyInterpolateEnvVars('port:{{ PORT }}');
        expect(result).toBe('port:5432');
      });
    });

    describe('Error Cases', () => {
      it('throws when env var undefined: "{{ MISSING }}" → Error', () => {
        expect(() => recursivelyInterpolateEnvVars('{{ MISSING }}')).toThrow(
          "Environment variable 'MISSING' is not set"
        );
      });

      it('provides clear error message with variable name', () => {
        expect(() => recursivelyInterpolateEnvVars('{{ UNDEFINED_VAR }}')).toThrow(
          /UNDEFINED_VAR/
        );
      });

      it('throws on first missing var when multiple are missing', () => {
        expect(() => recursivelyInterpolateEnvVars('{{ MISSING1 }}:{{ MISSING2 }}')).toThrow(
          "Environment variable 'MISSING1' is not set"
        );
      });
    });

    describe('Array Interpolation', () => {
      it('interpolates strings in arrays: ["{{ DB_HOST }}"] → ["localhost"]', () => {
        const result = recursivelyInterpolateEnvVars(['{{ DB_HOST }}']);
        expect(result).toEqual(['localhost']);
      });

      it('recurses through nested arrays', () => {
        const result = recursivelyInterpolateEnvVars([['{{ DB_HOST }}', '{{ DB_USER }}']]);
        expect(result).toEqual([['localhost', 'admin']]);
      });

      it('handles mixed types in arrays: [1, "{{ DB_HOST }}", true]', () => {
        const result = recursivelyInterpolateEnvVars([1, '{{ DB_HOST }}', true]);
        expect(result).toEqual([1, 'localhost', true]);
      });
    });

    describe('Object Interpolation', () => {
      it('interpolates object values: {db: "{{ DB_HOST }}"} → {db: "localhost"}', () => {
        const result = recursivelyInterpolateEnvVars({ db: '{{ DB_HOST }}' });
        expect(result).toEqual({ db: 'localhost' });
      });

      it('preserves object keys (never interpolates keys)', () => {
        const result = recursivelyInterpolateEnvVars({ '{{ KEY }}': 'value', normal: '{{ DB_HOST }}' });
        expect(result).toEqual({ '{{ KEY }}': 'value', normal: 'localhost' });
      });

      it('recurses through deeply nested objects', () => {
        const result = recursivelyInterpolateEnvVars({
          level1: {
            level2: {
              host: '{{ DB_HOST }}',
              port: '{{ DB_PORT }}',
            },
          },
        });
        expect(result).toEqual({
          level1: {
            level2: {
              host: 'localhost',
              port: '5432',
            },
          },
        });
      });
    });

    describe('Non-string Types', () => {
      it('passes through numbers unchanged', () => {
        const result = recursivelyInterpolateEnvVars(42);
        expect(result).toBe(42);
      });

      it('passes through booleans unchanged', () => {
        const result = recursivelyInterpolateEnvVars(true);
        expect(result).toBe(true);
      });

      it('passes through null unchanged', () => {
        const result = recursivelyInterpolateEnvVars(null);
        expect(result).toBe(null);
      });

      it('passes through undefined unchanged', () => {
        const result = recursivelyInterpolateEnvVars(undefined);
        expect(result).toBe(undefined);
      });
    });
  });

  describe('Config File Loading and CLI Integration', () => {
    let restoreEnv: () => void;
    let originalArgv: string[];

    beforeEach(() => {
      restoreEnv = mockProcessEnv(testEnvVars);
      originalArgv = process.argv;

      // Reset mocks
      mockExistsSync.mockReset();
      mockReadFileSync.mockReset();
      mockGenerate.mockReset().mockResolvedValue(undefined);
    });

    afterEach(() => {
      process.argv = originalArgv;
      restoreEnv();
    });

    it('loads sapatosconfig.json when present', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(validConfigs.withDb);
      process.argv = ['node', 'cli.js', '{}'];

      await runCLI();

      expect(mockExistsSync).toHaveBeenCalledWith('sapatosconfig.json');
      expect(mockReadFileSync).toHaveBeenCalledWith('sapatosconfig.json', { encoding: 'utf8' });
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('uses empty config {} when file missing', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js', '{}'];

      await runCLI();

      expect(mockExistsSync).toHaveBeenCalledWith('sapatosconfig.json');
      expect(mockGenerate).toHaveBeenCalledWith({});
    });

    it('merges file config with CLI args', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ db: { host: 'localhost' } }));
      process.argv = ['node', 'cli.js', JSON.stringify({ outDir: './src' })];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({
        db: { host: 'localhost' },
        outDir: './src',
      });
    });

    it('CLI args override file config', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ outDir: './old', schemas: {} }));
      process.argv = ['node', 'cli.js', JSON.stringify({ outDir: './new' })];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({
        outDir: './new',
        schemas: {},
      });
    });

    it('throws clear error for invalid JSON in config file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(invalidConfigs.malformedJson);
      process.argv = ['node', 'cli.js', '{}'];

      await expect(runCLI()).rejects.toThrow(
        /sapatosconfig.json must be a valid JSON file/
      );
    });

    it('throws clear error for invalid JSON in CLI args', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js', invalidConfigs.malformedJson];

      await expect(runCLI()).rejects.toThrow(
        /argument to Sapatos must be valid JSON/
      );
    });

    it('includes original error message in thrown error', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{invalid}');
      process.argv = ['node', 'cli.js', '{}'];

      await expect(runCLI()).rejects.toThrow(/JSON/);
    });

    it('handles empty config file', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{}');
      process.argv = ['node', 'cli.js', '{}'];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({});
    });

    it('defaults to {} when no CLI args provided', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js'];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({});
    });

    it('interpolates env vars in file config', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(validConfigs.withEnvVars);
      process.argv = ['node', 'cli.js', '{}'];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({
        db: {
          host: 'localhost',
          port: '5432',
          user: 'admin',
          password: 'secret123',
          database: 'testdb',
        },
      });
    });

    it('interpolates env vars in CLI args', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js', JSON.stringify({ db: { host: '{{ DB_HOST }}' } })];

      await runCLI();

      expect(mockGenerate).toHaveBeenCalledWith({
        db: { host: 'localhost' },
      });
    });

    it('throws when env var missing in file config', async () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(invalidConfigs.missingEnvVar);
      process.argv = ['node', 'cli.js', '{}'];

      await expect(runCLI()).rejects.toThrow(/MISSING_VAR/);
      await expect(runCLI()).rejects.toThrow(/is not set/);
    });

    it('throws when env var missing in CLI args', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js', JSON.stringify({ db: { host: '{{ MISSING }}' } })];

      await expect(runCLI()).rejects.toThrow(/MISSING/);
    });

    it('awaits generate() completion', async () => {
      mockExistsSync.mockReturnValue(false);
      process.argv = ['node', 'cli.js', '{}'];

      // Verify that runCLI() is an async function that completes
      const promise = runCLI();
      expect(promise).toBeInstanceOf(Promise);
      await promise;
      expect(mockGenerate).toHaveBeenCalled();
    });

    it('propagates generate() errors to caller', async () => {
      mockExistsSync.mockReturnValue(false);
      mockGenerate.mockRejectedValue(new Error('Database connection failed'));
      process.argv = ['node', 'cli.js', '{}'];

      await expect(runCLI()).rejects.toThrow('Database connection failed');
    });
  });
});
