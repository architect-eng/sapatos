#!/usr/bin/env node
// ^^ this shebang is for the compiled JS file, not the TS source



import * as fs from 'fs';
import type { Config } from './config';
import { generate } from ".";


/**
 * Recursively interpolates environment variables in strings using {{ VAR_NAME }} syntax.
 * Exported for testing.
 */
export const recursivelyInterpolateEnvVars = (obj: unknown): unknown =>
  // string? => do the interpolation
  typeof obj === 'string' ?
    obj.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_0, name: string) => {
      const e = process.env[name];
      if (e === undefined) throw new Error(`Environment variable '${name}' is not set`);
      return e;
    }) :
    // array? => recurse over its items
    Array.isArray(obj) ?
      obj.map((item: unknown) => recursivelyInterpolateEnvVars(item)) :
      // object? => recurse over its values (but don't touch the keys)
      obj !== null && typeof obj === 'object' ?
        Object.keys(obj).reduce<Record<string, unknown>>((memo, key) => {
          memo[key] = recursivelyInterpolateEnvVars((obj as Record<string, unknown>)[key]);
          return memo;
        }, {}) :
        // anything else (e.g. number)? => pass right through
        obj;

/**
 * Main CLI execution logic. Loads config from file and CLI args, then runs generation.
 * Exported for testing.
 */
export const runCLI = async (): Promise<void> => {
  const
    configFile = 'sapatosconfig.json',
    configJSON = fs.existsSync(configFile) ? fs.readFileSync(configFile, { encoding: 'utf8' }) : '{}',
    argsJSON = process.argv[2] ?? '{}';

  let fileConfig;
  try {
    fileConfig = recursivelyInterpolateEnvVars(JSON.parse(configJSON));

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`If present, sapatosconfig.json must be a valid JSON file, and all referenced environment variables must exist: ${message}`);
  }

  let argsConfig;
  try {
    argsConfig = recursivelyInterpolateEnvVars(JSON.parse(argsJSON));

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`If present, the argument to Sapatos must be valid JSON, and all referenced environment variables must exist: ${message}`);
  }

  await generate({ ...fileConfig as object, ...argsConfig as object } as Config);
};

// Execute CLI when run directly (not when imported as a module for testing)
// Check if we're running in a test environment by looking for vitest globals
const isTestEnvironment = process.env['VITEST'] !== undefined || process.env['NODE_ENV'] === 'test';
if (!isTestEnvironment) {
  void runCLI();
}
