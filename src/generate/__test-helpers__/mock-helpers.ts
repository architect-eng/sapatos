import { vi } from 'vitest';

/**
 * Creates a mock file system for testing without actual file I/O.
 * Returns mock functions and utilities to control file system behavior.
 */
export const mockFileSystem = () => {
  const files = new Map<string, string>();

  return {
    // Mock functions matching fs module
    existsSync: vi.fn((path: string) => files.has(path)),
    readFileSync: vi.fn((path: string) => {
      const content = files.get(path);
      if (content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`);
      }
      return content;
    }),
    writeFileSync: vi.fn((path: string, data: string) => {
      files.set(path, data);
    }),
    mkdirSync: vi.fn(),

    // Test utilities
    setFile: (path: string, content: string) => files.set(path, content),
    getFile: (path: string) => files.get(path),
    clear: () => files.clear(),
    getAllFiles: () => new Map(files),
  };
};

/**
 * Temporarily overrides process.env with test variables.
 * Returns a cleanup function to restore the original environment.
 */
export const mockProcessEnv = (vars: Record<string, string>): (() => void) => {
  const original = { ...process.env };

  // Set test variables
  Object.assign(process.env, vars);

  // Return cleanup function
  return () => {
    process.env = original;
  };
};

/**
 * Creates a spy on console methods for testing output.
 */
export const mockConsole = () => {
  return {
    log: vi.spyOn(console, 'log').mockImplementation(() => {}),
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  };
};
