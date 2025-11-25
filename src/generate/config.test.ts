import { describe, it, expect } from 'vitest';
import { finaliseConfig } from './config';

describe('config.ts', () => {
  describe('finaliseConfig', () => {
    it('should apply defaults for empty config', () => {
      const config = finaliseConfig({});

      expect(config.outDir).toBe('.');
      expect(config.outExt).toBe('.ts');
      expect(config.schemas).toEqual({ public: { include: '*', exclude: [] } });
      expect(config.debugListener).toBe(false);
      expect(config.progressListener).toBe(false);
      expect(config.warningListener).toBe(true);
      expect(config.customTypesTransform).toBe('PgMy_type');
      expect(config.columnOptions).toEqual({});
      expect(config.schemaJSDoc).toBe(true);
      expect(config.unprefixedSchema).toBe('public');
      expect(config.customJSONParsingForLargeNumbers).toBe(false);
    });

    it('should override defaults with provided values', () => {
      const config = finaliseConfig({
        outDir: './generated',
        outExt: '.d.ts',
        schemaJSDoc: false,
      });

      expect(config.outDir).toBe('./generated');
      expect(config.outExt).toBe('.d.ts');
      expect(config.schemaJSDoc).toBe(false);
      // Defaults still apply for non-overridden
      expect(config.warningListener).toBe(true);
    });

    it('should accept custom schema rules', () => {
      const config = finaliseConfig({
        schemas: {
          public: { include: ['users', 'posts'], exclude: [] },
          audit: { include: '*', exclude: ['internal_logs'] },
        },
      });

      expect(config.schemas.public).toEqual({ include: ['users', 'posts'], exclude: [] });
      expect(config.schemas.audit).toEqual({ include: '*', exclude: ['internal_logs'] });
    });

    it('should accept custom column options', () => {
      const config = finaliseConfig({
        columnOptions: {
          '*': {
            created_at: { insert: 'excluded', update: 'excluded' },
          },
          users: {
            id: { insert: 'excluded' },
          },
        },
      });

      expect(config.columnOptions['*']?.created_at).toEqual({
        insert: 'excluded',
        update: 'excluded',
      });
      expect(config.columnOptions.users?.id).toEqual({ insert: 'excluded' });
    });

    it('should accept custom type transform function', () => {
      const customTransform = (s: string) => `Custom_${s}`;
      const config = finaliseConfig({
        customTypesTransform: customTransform,
      });

      expect(config.customTypesTransform).toBe(customTransform);
    });

    it('should accept listener functions', () => {
      const debugFn = (_s: string) => { /* noop */ };
      const config = finaliseConfig({
        debugListener: debugFn,
        progressListener: true,
      });

      expect(config.debugListener).toBe(debugFn);
      expect(config.progressListener).toBe(true);
    });
  });
});
