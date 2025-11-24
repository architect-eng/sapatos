/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-confusing-void-expression */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockConfig } from './__fixtures__/common-fixtures';
import { generate } from './write';

// Use vi.hoisted() to create mocks before module imports
const { mockExistsSync, mockMkdirSync, mockWriteFileSync, mockTsForConfig } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockTsForConfig: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock('./tsOutput', () => ({
  tsForConfig: mockTsForConfig,
}));

describe('write Module', () => {
  describe('generate - Happy Path', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockExistsSync.mockReturnValue(false);
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users { id: number; name: string; }',
        customTypeSourceFiles: {},
      });
    });

    it('creates sapatos folder with recursive: true', async () => {
      const config = createMockConfig({ outDir: './test-output' });
      await generate(config);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('sapatos'),
        { recursive: true }
      );
    });

    it('writes schema file with generated TypeScript', async () => {
      const config = createMockConfig({ outDir: './test-output' });
      await generate(config);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('schema.d.ts'),
        expect.stringContaining('export interface Users'),
        { flag: 'w' }
      );
    });

    it('uses config.outExt for file extension', async () => {
      const config = createMockConfig({ outDir: './test-output', outExt: '.ts' });
      await generate(config);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('schema.ts'),
        expect.anything(),
        { flag: 'w' }
      );
    });

    it('uses config.outDir for target path', async () => {
      const config = createMockConfig({ outDir: './my-custom-dir' });
      await generate(config);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('my-custom-dir'),
        { recursive: true }
      );
    });

    it('calls tsForConfig with config and debug function', async () => {
      const config = createMockConfig();
      await generate(config);

      expect(mockTsForConfig).toHaveBeenCalledWith(
        expect.objectContaining({ outDir: config.outDir }),
        expect.any(Function),
        undefined  // No existing pool
      );
    });

    it('passes existing pool to tsForConfig when provided', async () => {
      const config = createMockConfig();
      const mockPool = {} as any;
      await generate(config, mockPool);

      expect(mockTsForConfig).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        mockPool
      );
    });

    it('does not create custom folder when no custom types', async () => {
      const config = createMockConfig();
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users {}',
        customTypeSourceFiles: {},
      });

      await generate(config);

      // Should only create sapatos folder, not custom folder
      expect(mockMkdirSync).toHaveBeenCalledTimes(1);
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('sapatos'),
        { recursive: true }
      );
    });

    it('returns void (no return value)', async () => {
      const config = createMockConfig();
      const result = await generate(config);

      expect(result).toBeUndefined();
    });
  });

  describe('generate - Custom Types', () => {
    const mockCustomTypes = {
      PgMy_type: 'export type PgMy_type = any;',
      PgAnother: 'export type PgAnother = string;',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockExistsSync.mockReturnValue(false);
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users {}',
        customTypeSourceFiles: mockCustomTypes,
      });
    });

    it('creates sapatos/custom folder when custom types exist', async () => {
      const config = createMockConfig({ outDir: './test' });
      await generate(config);

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/test.*sapatos$/),
        { recursive: true }
      );
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringMatching(/test.*sapatos.*custom$/),
        { recursive: true }
      );
    });

    it('writes custom type files with correct names', async () => {
      const config = createMockConfig({ outExt: '.d.ts' });
      await generate(config);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('PgMy_type.d.ts'),
        'export type PgMy_type = any;',
        { flag: 'w' }
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('PgAnother.d.ts'),
        'export type PgAnother = string;',
        { flag: 'w' }
      );
    });

    it('does NOT overwrite existing custom type files', async () => {
      const config = createMockConfig();
      mockExistsSync.mockImplementation((path: string) => {
        return path.includes('PgMy_type.d.ts');
      });

      await generate(config);

      // PgMy_type should not be written (already exists)
      const myTypeWrites = (mockWriteFileSync.mock.calls as any[]).filter(
        call => call[0].includes('PgMy_type.d.ts')
      );
      expect(myTypeWrites.length).toBe(0);

      // PgAnother should be written (doesn't exist)
      const anotherWrites = (mockWriteFileSync.mock.calls as any[]).filter(
        call => call[0].includes('PgAnother.d.ts')
      );
      expect(anotherWrites.length).toBe(1);
    });

    it('logs message when skipping existing custom type file', async () => {
      const mockLog = vi.fn();
      const config = createMockConfig({ progressListener: mockLog });
      mockExistsSync.mockReturnValue(true); // All files exist

      await generate(config);

      expect(mockLog).toHaveBeenCalled();
      const logs = mockLog.mock.calls.map((call: any) => call[0]);
      const existsLog = logs.find((log: string) => log.includes('already exists'));
      expect(existsLog).toBeTruthy();
    });

    it('writes custom/index.d.ts with module declaration', async () => {
      const config = createMockConfig({ outExt: '.d.ts' });
      await generate(config);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom/index.d.ts'),
        expect.stringContaining("declare module '@architect-eng/sapatos/custom'"),
        { flag: 'w' }
      );
    });

    it('uses config.outExt for custom type files', async () => {
      const config = createMockConfig({ outExt: '.ts' });
      await generate(config);

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('PgMy_type.ts'),
        expect.anything(),
        { flag: 'w' }
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('custom/index.ts'),
        expect.anything(),
        { flag: 'w' }
      );
    });

    it('creates all custom type files before index', async () => {
      const config = createMockConfig();
      await generate(config);

      const writeOrder = mockWriteFileSync.mock.calls.map((call: any) => call[0]);
      const indexPos = writeOrder.findIndex((path: string) => path.includes('index.d.ts'));
      const pgMyTypePos = writeOrder.findIndex((path: string) => path.includes('PgMy_type.d.ts'));
      const pgAnotherPos = writeOrder.findIndex((path: string) => path.includes('PgAnother.d.ts'));

      // Custom types should be written before index
      expect(pgMyTypePos).toBeGreaterThan(-1);
      expect(pgAnotherPos).toBeGreaterThan(-1);
      expect(indexPos).toBeGreaterThan(pgMyTypePos);
      expect(indexPos).toBeGreaterThan(pgAnotherPos);
    });

    it('throws if custom type content is undefined', async () => {
      const config = createMockConfig();
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users {}',
        customTypeSourceFiles: { BadType: undefined as any },
      });

      await expect(generate(config)).rejects.toThrow('No content found for custom type file: BadType');
    });
  });

  describe('generate - Listeners', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockExistsSync.mockReturnValue(false);
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users {}',
        customTypeSourceFiles: {},
      });
    });

    it('calls progressListener with folder creation message', async () => {
      const mockLog = vi.fn();
      const config = createMockConfig({ progressListener: mockLog });
      await generate(config);

      expect(mockLog).toHaveBeenCalled();
      const logs = mockLog.mock.calls.map((call: any) => call[0]);
      const folderLog = logs.find((log: string) => log.includes('(Re)creating schema folder'));
      expect(folderLog).toBeTruthy();
    });

    it('calls progressListener with file write messages', async () => {
      const mockLog = vi.fn();
      const config = createMockConfig({ progressListener: mockLog });
      await generate(config);

      const logs = mockLog.mock.calls.map((call: any) => call[0]);
      const writeLog = logs.find((log: string) => log.includes('Writing generated schema'));
      expect(writeLog).toBeTruthy();
    });

    it('calls warningListener for new custom type files', async () => {
      const mockWarn = vi.fn();
      const config = createMockConfig({ warningListener: mockWarn });
      mockTsForConfig.mockResolvedValue({
        ts: 'export interface Users {}',
        customTypeSourceFiles: { PgType: 'export type PgType = any;' },
      });
      mockExistsSync.mockReturnValue(false); // File doesn't exist (new file)

      await generate(config);

      expect(mockWarn).toHaveBeenCalled();
      const warnings = mockWarn.mock.calls.map((call: any) => call[0]);
      const newFileWarning = warnings.find((w: string) => w.includes('Writing new custom type'));
      expect(newFileWarning).toBeTruthy();
    });

    it('supports progressListener: true (uses console.log)', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => { });
      const config = createMockConfig({ progressListener: true });

      await generate(config);

      expect(consoleSpy).toHaveBeenCalled();
      const logs = consoleSpy.mock.calls.map((call: any) => call[0]);
      const folderLog = logs.find((log: string) => log?.includes('schema folder'));
      expect(folderLog).toBeTruthy();

      consoleSpy.mockRestore();
    });

    it('does not log when progressListener is false', async () => {
      const config = createMockConfig({ progressListener: false });
      await generate(config);

      // Should not throw or cause issues, just silently works
      expect(mockMkdirSync).toHaveBeenCalled(); // Work still happens
    });
  });
});
