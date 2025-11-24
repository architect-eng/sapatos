/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockConfig } from './__fixtures__/common-fixtures';
import { srcWarning } from './legacy';

// Use vi.hoisted() to create mocks before module imports
const { mockExistsSync, mockStatSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockStatSync: vi.fn(),
  mockReaddirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  statSync: mockStatSync,
  readdirSync: mockReaddirSync,
}));

describe('legacy Module', () => {
  describe('srcWarning', () => {
    let mockWarn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockWarn = vi.fn();
      mockExistsSync.mockReturnValue(false);
      mockStatSync.mockReturnValue({ isFile: () => true });
      mockReaddirSync.mockReturnValue([]);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('does nothing when no legacy files exist', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void });
      mockExistsSync.mockReturnValue(false);  // All files missing

      srcWarning(config);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('warns when sapatos/schema.ts exists', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void, outDir: './test' });
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('schema.ts');
      });

      srcWarning(config);

      expect(mockWarn).toHaveBeenCalled();
      const warning = mockWarn.mock.calls[0][0];
      expect(warning).toContain('SAPATOS NO LONGER COPIES ITS SOURCE');
      expect(warning).toContain("Delete the file 'sapatos/schema.ts'");
    });

    it('warns when sapatos/src folder exists', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void });
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('/src');
      });

      srcWarning(config);

      expect(mockWarn).toHaveBeenCalled();
      const warning = mockWarn.mock.calls[0][0];
      expect(warning).toContain("Delete the folder 'sapatos/src'");
    });

    it('warns when custom .ts files exist (non-.d.ts)', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void });
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('/custom');
      });
      mockStatSync.mockReturnValue({ isFile: () => false });  // Directory
      mockReaddirSync.mockReturnValue(['mytype.ts', 'index.ts']);
      mockStatSync.mockReturnValue({ isFile: () => true });

      srcWarning(config);

      expect(mockWarn).toHaveBeenCalled();
      const warning = mockWarn.mock.calls[0][0];
      expect(warning).toContain("Transfer any customised type declarations");
      expect(warning).toContain("Delete all the plain '.ts' files");
    });

    it('skips warning when outExt is .ts', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void, outExt: '.ts' });
      mockExistsSync.mockReturnValue(true);  // All legacy files exist

      srcWarning(config);

      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('uses console.log when warningListener is true', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const config = createMockConfig({ warningListener: true });
      mockExistsSync.mockImplementation((path: string) => path.includes('schema.ts'));

      srcWarning(config);

      expect(consoleSpy).toHaveBeenCalled();
      const warning = consoleSpy.mock.calls[0][0];
      expect(warning).toContain('SAPATOS NO LONGER COPIES');

      consoleSpy.mockRestore();
    });

    it('does not call warning listener when it is false', () => {
      const config = createMockConfig({ warningListener: false as const });
      mockExistsSync.mockReturnValue(true);

      srcWarning(config);

      // Should not throw or call anything
      expect(mockWarn).not.toHaveBeenCalled();
    });

    it('includes migration instructions in warning', () => {
      const config = createMockConfig({ warningListener: mockWarn as (s: string) => void });
      mockExistsSync.mockImplementation((path: string) => path.includes('schema.ts'));

      srcWarning(config);

      const warning = mockWarn.mock.calls[0][0];
      expect(warning).toContain('Make sure sapatos is a "dependency"');
      expect(warning).toContain('Remove the "srcMode" key');
      expect(warning).toContain("import * as sapatos from 'sapatos/generate'");
      expect(warning).toContain("import * as db from 'sapatos/db'");
      expect(warning).toContain("import type * as s from 'sapatos/schema'");
    });
  });
});
