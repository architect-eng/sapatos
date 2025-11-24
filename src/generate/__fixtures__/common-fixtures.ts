/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { CompleteConfig } from '../config';
import type { Relation } from '../tables';

/**
 * Creates a mock CompleteConfig with sensible defaults for testing.
 * All fields can be overridden via the overrides parameter.
 */
export const createMockConfig = (overrides: Partial<CompleteConfig> = {}): CompleteConfig => ({
  db: {
    host: 'localhost',
    port: 5432,
    database: 'test',
    user: 'test',
    password: 'test',
  },
  outDir: './test-output',
  outExt: '.d.ts',
  schemas: {
    public: { include: '*', exclude: [] },
  },
  unprefixedSchema: 'public',
  columnOptions: {},
  customTypesTransform: 'PgMy_type',
  schemaJSDoc: false,
  progressListener: false,
  warningListener: false,
  debugListener: false,
  customJSONParsingForLargeNumbers: false,
  ...overrides,
});

/**
 * Creates a mock pg.Pool for testing database queries.
 */
export const createMockPool = () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (() => Promise.resolve({ rows: [], rowCount: 0 })) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  end: (() => Promise.resolve(undefined)) as any,
});

/**
 * Creates a mock Relation for testing.
 */
export const createMockRelation = (name: string, overrides: Partial<Relation> = {}): Relation => ({
  schema: 'public',
  name,
  type: 'table',
  insertable: true,
  ...overrides,
});

/**
 * Column row data used in multiple tests.
 */
export interface ColumnRow {
  column: string;
  udtName: string;
  isNullable: boolean;
  isGenerated: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
  domainName: string | null;
  description: string | null;
}

/**
 * Creates a standard column row for testing.
 */
export const createMockColumn = (overrides: Partial<ColumnRow> = {}): ColumnRow => ({
  column: 'id',
  udtName: 'int4',
  isNullable: false,
  isGenerated: false,
  hasDefault: true,
  defaultValue: 'nextval(...)',
  domainName: null,
  description: null,
  ...overrides,
});
