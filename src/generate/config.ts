

import * as fs from 'fs';
import * as path from 'path';
import type * as pg from 'pg';


// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RequiredConfig {
  // nothing is required any more
}

export interface OptionalConfig {
  db: pg.ClientConfig;
  outDir: string;
  outExt: string;
  schemas: SchemaRules;
  debugListener: boolean | ((s: string) => void);
  progressListener: boolean | ((s: string) => void);
  warningListener: boolean | ((s: string) => void);
  customTypesTransform: 'PgMy_type' | 'my_type' | 'PgMyType' | ((s: string) => string);
  columnOptions: ColumnOptions;
  schemaJSDoc: boolean;
  unprefixedSchema: string | null;
  customJSONParsingForLargeNumbers: boolean;
  /**
   * Map PostgreSQL base types (including composite types) to TypeScript types.
   * When a domain is based on a mapped type, the domain's custom type will
   * reference the base type's TypeScript alias.
   *
   * Example:
   * ```json
   * {
   *   "baseTypeMappings": {
   *     "typeid": "[string, string]"
   *   }
   * }
   * ```
   *
   * This creates:
   * - `PgTypeid.ts` with `export type PgTypeid = [string, string]`
   * - `PgTenant_id.ts` with `export type PgTenant_id = PgTypeid` (for domain `tenant_id AS typeid`)
   */
  baseTypeMappings: Record<string, string>;
}

interface SchemaRules {
  [schema: string]: {
    include: '*' | string[];
    exclude: '*' | string[];
  };
}

interface ColumnOptions {
  [k: string]: {  // table name or "*"
    [k: string]: {  // column name
      insert?: 'auto' | 'excluded' | 'optional';
      update?: 'auto' | 'excluded';
    };
  };
}

export type Config = RequiredConfig & Partial<OptionalConfig>;
export type CompleteConfig = RequiredConfig & OptionalConfig;

const defaultConfig: Config = {
  outDir: '.',
  outExt: '.ts',  // Changed from '.d.ts' for explicit exports
  schemas: { public: { include: '*', exclude: [] } },
  debugListener: false,
  progressListener: false,
  warningListener: true,
  customTypesTransform: 'PgMy_type',
  columnOptions: {},
  schemaJSDoc: true,
  unprefixedSchema: 'public',
  customJSONParsingForLargeNumbers: false,
  baseTypeMappings: {},
};

export const moduleRoot = () => {
  // __dirname could be either ./generate (ts) or ./dist/generate (js)
  const parentDir = path.join(__dirname, '..');
  return fs.existsSync(path.join(parentDir, 'package.json')) ?
    parentDir :
    path.join(parentDir, '..');
};

export const finaliseConfig = (config: Config) => {
  const finalConfig = { ...defaultConfig, ...config };
  return finalConfig as CompleteConfig;
};
