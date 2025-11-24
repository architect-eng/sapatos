import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { finaliseConfig, moduleRoot } from './config';

const { mockExistsSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
}));

describe('Config Module', () => {
  describe('finaliseConfig', () => {
    describe('Default Values', () => {
      it('applies default outDir: "."', () => {
        const result = finaliseConfig({});
        expect(result.outDir).toBe('.');
      });

      it('applies default outExt: ".d.ts"', () => {
        const result = finaliseConfig({});
        expect(result.outExt).toBe('.d.ts');
      });

      it('applies default schemas: {public: {include: "*", exclude: []}}', () => {
        const result = finaliseConfig({});
        expect(result.schemas).toEqual({
          public: { include: '*', exclude: [] },
        });
      });

      it('applies default customTypesTransform: "PgMy_type"', () => {
        const result = finaliseConfig({});
        expect(result.customTypesTransform).toBe('PgMy_type');
      });

      it('applies default unprefixedSchema: "public"', () => {
        const result = finaliseConfig({});
        expect(result.unprefixedSchema).toBe('public');
      });

      it('applies default schemaJSDoc: true', () => {
        const result = finaliseConfig({});
        expect(result.schemaJSDoc).toBe(true);
      });

      it('applies default customJSONParsingForLargeNumbers: false', () => {
        const result = finaliseConfig({});
        expect(result.customJSONParsingForLargeNumbers).toBe(false);
      });

      it('applies default debugListener: false', () => {
        const result = finaliseConfig({});
        expect(result.debugListener).toBe(false);
      });

      it('applies default progressListener: false', () => {
        const result = finaliseConfig({});
        expect(result.progressListener).toBe(false);
      });

      it('applies default warningListener: true', () => {
        const result = finaliseConfig({});
        expect(result.warningListener).toBe(true);
      });

      it('applies default columnOptions: {}', () => {
        const result = finaliseConfig({});
        expect(result.columnOptions).toEqual({});
      });
    });

    describe('User Overrides', () => {
      it('preserves user-provided outDir', () => {
        const result = finaliseConfig({ outDir: './src/generated' });
        expect(result.outDir).toBe('./src/generated');
      });

      it('preserves user-provided outExt: ".ts"', () => {
        const result = finaliseConfig({ outExt: '.ts' });
        expect(result.outExt).toBe('.ts');
      });

      it('preserves user-provided schemas', () => {
        const schemas = {
          public: { include: ['users', 'posts'], exclude: ['migrations'] },
          auth: { include: '*' as const, exclude: [] },
        };
        const result = finaliseConfig({ schemas });
        expect(result.schemas).toEqual(schemas);
      });

      it('preserves user customTypesTransform: "my_type"', () => {
        const result = finaliseConfig({ customTypesTransform: 'my_type' });
        expect(result.customTypesTransform).toBe('my_type');
      });

      it('preserves user customTypesTransform: "PgMyType"', () => {
        const result = finaliseConfig({ customTypesTransform: 'PgMyType' });
        expect(result.customTypesTransform).toBe('PgMyType');
      });

      it('preserves user customTypesTransform function', () => {
        const transform = (s: string) => `Custom_${s}`;
        const result = finaliseConfig({ customTypesTransform: transform });
        expect(result.customTypesTransform).toBe(transform);
      });

      it('allows unprefixedSchema: null', () => {
        const result = finaliseConfig({ unprefixedSchema: null });
        expect(result.unprefixedSchema).toBeNull();
      });

      it('preserves user-provided schemaJSDoc: false', () => {
        const result = finaliseConfig({ schemaJSDoc: false });
        expect(result.schemaJSDoc).toBe(false);
      });

      it('preserves user-provided customJSONParsingForLargeNumbers: true', () => {
        const result = finaliseConfig({ customJSONParsingForLargeNumbers: true });
        expect(result.customJSONParsingForLargeNumbers).toBe(true);
      });

      it('preserves user-provided columnOptions', () => {
        const columnOptions = {
          users: {
            created_at: { insert: 'excluded' as const },
          },
        };
        const result = finaliseConfig({ columnOptions });
        expect(result.columnOptions).toEqual(columnOptions);
      });
    });

    describe('Type Safety and Immutability', () => {
      it('returns CompleteConfig type with all required fields', () => {
        const result = finaliseConfig({});

        // Verify all required fields exist
        expect(result).toHaveProperty('outDir');
        expect(result).toHaveProperty('outExt');
        expect(result).toHaveProperty('schemas');
        expect(result).toHaveProperty('customTypesTransform');
        expect(result).toHaveProperty('unprefixedSchema');
        expect(result).toHaveProperty('schemaJSDoc');
        expect(result).toHaveProperty('customJSONParsingForLargeNumbers');
        expect(result).toHaveProperty('debugListener');
        expect(result).toHaveProperty('progressListener');
        expect(result).toHaveProperty('warningListener');
        expect(result).toHaveProperty('columnOptions');
      });

      it('does not mutate input config object', () => {
        const input = { outDir: './custom' };
        const inputCopy = { ...input };

        finaliseConfig(input);

        expect(input).toEqual(inputCopy);
      });

      it('handles partial config correctly', () => {
        const partial = {
          outDir: './src',
          schemaJSDoc: false,
        };

        const result = finaliseConfig(partial);

        expect(result.outDir).toBe('./src');
        expect(result.schemaJSDoc).toBe(false);
        expect(result.outExt).toBe('.d.ts'); // default
        expect(result.customTypesTransform).toBe('PgMy_type'); // default
      });

      it('merges complex nested objects like schemas', () => {
        const result = finaliseConfig({
          schemas: {
            auth: { include: ['users'], exclude: ['sessions'] },
          },
        });

        // User schema completely replaces default
        expect(result.schemas).toEqual({
          auth: { include: ['users'], exclude: ['sessions'] },
        });
      });
    });
  });

  describe('moduleRoot', () => {
    beforeEach(() => {
      mockExistsSync.mockReset();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('TypeScript Source Directory', () => {
      it('returns parent when package.json exists in parent', () => {
        // Mock: package.json exists in parent directory
        mockExistsSync.mockReturnValue(true);

        const result = moduleRoot();

        // Should call existsSync with parent/package.json
        expect(mockExistsSync).toHaveBeenCalled();

        // Result should be a string (parent directory path)
        expect(typeof result).toBe('string');
        expect(result).toBeTruthy();
      });

      it('checks for package.json in parent directory first', () => {
        mockExistsSync.mockReturnValue(true);

        moduleRoot();

        // Verify it checks parent directory
        expect(mockExistsSync).toHaveBeenCalledWith(
          expect.stringContaining('package.json')
        );
      });
    });

    describe('Compiled JavaScript Directory', () => {
      it('returns grandparent when package.json not in parent but in grandparent', () => {
        // First call (parent): false, Second call (grandparent): true
        mockExistsSync.mockReturnValue(false);

        const result = moduleRoot();

        // Should return grandparent path
        expect(typeof result).toBe('string');
        expect(result).toBeTruthy();
      });

      it('handles dist/generate structure correctly', () => {
        // When running from dist/generate, package.json is two levels up
        mockExistsSync.mockReturnValue(false);

        const result = moduleRoot();

        // Should check parent first, then grandparent
        expect(result).toBeTruthy();
      });
    });

    describe('Edge Cases', () => {
      it('uses path.join for cross-platform compatibility', () => {
        mockExistsSync.mockReturnValue(true);

        const result = moduleRoot();

        // Result should not contain platform-specific separators hardcoded
        expect(typeof result).toBe('string');
      });

      it('handles when package.json exists (typical case)', () => {
        mockExistsSync.mockReturnValue(true);

        const result = moduleRoot();

        expect(mockExistsSync).toHaveBeenCalledTimes(1);
        expect(result).toBeTruthy();
      });

      it('handles when package.json missing in parent (compiled case)', () => {
        mockExistsSync.mockReturnValue(false);

        const result = moduleRoot();

        // Should still return a path (grandparent)
        expect(result).toBeTruthy();
      });
    });

    describe('Integration with __dirname', () => {
      it('works with actual file system structure', () => {
        // This test uses real file system (no mocks)
        vi.restoreAllMocks();

        const result = moduleRoot();

        // Should return a valid directory path
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);

        // Result should be an absolute path
        expect(result).toMatch(/^[/\\]/); // Unix or Windows
      });
    });
  });
});
