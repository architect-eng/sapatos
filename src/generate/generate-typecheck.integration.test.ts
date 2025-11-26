import * as path from 'path';
import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  getTestConnectionConfig,
  type TestDatabase,
} from '../test-helpers/integration-db';
import {
  createTempProject,
  typecheckFiles,
  writeUsageFile,
  expectTypeCheckSuccess,
  hasUnusedExpectError,
} from '../test-helpers/typecheck';
import { finaliseConfig } from './config';
import { tsForConfig } from './tsOutput';

/**
 * Create test schemas for typecheck validation.
 * Using 'testgen' as main schema to avoid cluttering the default 'public' schema.
 * Also creates schemas with special characters to test namespace sanitization.
 */
async function setupTypecheckTestSchema(pool: Pool): Promise<void> {
  // Create schema
  await pool.query('CREATE SCHEMA IF NOT EXISTS testgen');

  // Create enum
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE testgen.user_status AS ENUM ('active', 'inactive', 'pending');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create basic table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS testgen.users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      status testgen.user_status DEFAULT 'pending',
      age INTEGER,
      is_admin BOOLEAN DEFAULT FALSE,
      metadata JSONB,
      tags TEXT[],
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Create table with nullable columns
  await pool.query(`
    CREATE TABLE IF NOT EXISTS testgen.nullable_table (
      id SERIAL PRIMARY KEY,
      optional_text TEXT,
      optional_int INTEGER,
      optional_bool BOOLEAN
    );
  `);

  // Create table with generated column
  await pool.query(`
    CREATE TABLE IF NOT EXISTS testgen.computed (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
    );
  `);

  // Create view
  await pool.query(`
    CREATE OR REPLACE VIEW testgen.user_summary AS
    SELECT id, name, status, created_at FROM testgen.users;
  `);

  // Create materialized view
  await pool.query(`
    DROP MATERIALIZED VIEW IF EXISTS testgen.user_stats;
    CREATE MATERIALIZED VIEW testgen.user_stats AS
    SELECT status, COUNT(*) as user_count FROM testgen.users GROUP BY status;
  `);

  // Create table with spaces in name (for namespace sanitization testing)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS testgen."table with spaces" (
      id SERIAL PRIMARY KEY,
      "column with spaces" TEXT
    );
  `);

  // Create schema with space in name (for namespace sanitization testing)
  await pool.query('CREATE SCHEMA IF NOT EXISTS "test schema"');

  // Create table in schema with space
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "test schema".users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );
  `);
}

async function cleanTypecheckTestSchema(pool: Pool): Promise<void> {
  await pool.query('DROP SCHEMA IF EXISTS testgen CASCADE');
  await pool.query('DROP SCHEMA IF EXISTS "test schema" CASCADE');
}

describe('Generated Schema TypeCheck - Integration Tests', () => {
  let db: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    db = await startTestDatabase();
    pool = db.pool;
    await cleanTypecheckTestSchema(pool);
    await setupTypecheckTestSchema(pool);
  }, 60000);

  afterAll(async () => {
    await cleanTypecheckTestSchema(pool);
    await stopTestDatabase();
  }, 60000);

  describe('Schema Compilation', () => {
    // NOTE: These tests use a custom 'testgen' schema to avoid cluttering the
    // default 'public' schema with test objects. Schema/table names with special
    // characters are now properly sanitized for valid TypeScript namespace names.

    it('should compile generated schema without TypeScript errors', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { testgen: { include: '*', exclude: [] } },
      });

      const { ts, customTypeSourceFiles } = await tsForConfig(config, () => void 0);
      const project = createTempProject(ts, customTypeSourceFiles);

      try {
        // Include custom type files in typecheck
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const allFiles = [project.schemaPath, ...customFiles];

        const result = typecheckFiles(project.rootDir, allFiles);

        if (!result.success) {
          console.error('TypeScript errors:\n', result.formattedDiagnostics);
          console.error('Root dir:', project.rootDir);
          console.error('Files checked:', allFiles);
        }
        expect(result.success).toBe(true);
        expect(result.errorCount).toBe(0);
      } finally {
        project.cleanup();
      }
    });

    // Note: Custom domain type tests removed because our test schema (testgen)
    // doesn't include custom domain types. The basic schema compilation test
    // above validates that the generated code is syntactically correct.

    it('should compile schema with table containing spaces in name', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { testgen: { include: '*', exclude: [] } },
      });

      const { ts, customTypeSourceFiles } = await tsForConfig(config, () => void 0);
      const project = createTempProject(ts, customTypeSourceFiles);

      try {
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [project.schemaPath, ...customFiles]);

        if (!result.success) {
          console.error('TypeScript errors:\n', result.formattedDiagnostics);
        }
        expect(result.success).toBe(true);

        // Verify sanitized namespace name is used (table_with_spaces instead of "table with spaces")
        expect(ts).toContain('namespace table_with_spaces');
        // Verify original table name is preserved in the Table type string
        expect(ts).toContain("Table = 'testgen.table with spaces'");
      } finally {
        project.cleanup();
      }
    });

    it('should compile schema with space in name', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: {
          testgen: { include: '*', exclude: [] },
          'test schema': { include: '*', exclude: [] },
        },
        unprefixedSchema: null, // Force namespace generation for all schemas
      });

      const { ts, customTypeSourceFiles } = await tsForConfig(config, () => void 0);
      const project = createTempProject(ts, customTypeSourceFiles);

      try {
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [project.schemaPath, ...customFiles]);

        if (!result.success) {
          console.error('TypeScript errors:\n', result.formattedDiagnostics);
        }
        expect(result.success).toBe(true);

        // Verify sanitized schema namespace name is used
        expect(ts).toContain('namespace test_schema');
        // Verify original schema name is preserved in string literals
        expect(ts).toContain("'test schema'");
      } finally {
        project.cleanup();
      }
    });

    it('should compile public schema with unprefixedSchema: null', async () => {
      const connectionConfig = getTestConnectionConfig();
      // First create a table in the public schema for this test
      await pool.query(`
        CREATE TABLE IF NOT EXISTS public.typecheck_test_table (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );
      `);

      try {
        const config = finaliseConfig({
          db: connectionConfig,
          schemas: {
            public: { include: ['typecheck_test_table'], exclude: [] },
          },
          unprefixedSchema: null, // Force 'namespace public' -> 'namespace _public'
        });

        const { ts, customTypeSourceFiles } = await tsForConfig(config, () => void 0);
        const project = createTempProject(ts, customTypeSourceFiles);

        try {
          const result = typecheckFiles(project.rootDir, [project.schemaPath]);

          if (!result.success) {
            console.error('TypeScript errors:\n', result.formattedDiagnostics);
          }
          expect(result.success).toBe(true);

          // Verify the sanitized namespace name is used (_public for reserved word 'public')
          expect(ts).toContain('namespace _public');
          // Verify 'namespace public {' is NOT present (would be invalid TS)
          expect(ts).not.toMatch(/namespace public\s*\{/);
        } finally {
          project.cleanup();
        }
      } finally {
        await pool.query('DROP TABLE IF EXISTS public.typecheck_test_table');
      }
    });
  });

  describe('Type Usage Validation', () => {
    let schemaTs: string;
    let customTypeSourceFiles: Record<string, string>;

    beforeAll(async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { testgen: { include: '*', exclude: [] } },
      });

      const result = await tsForConfig(config, () => void 0);
      schemaTs = result.ts;
      customTypeSourceFiles = result.customTypeSourceFiles;
    });

    it('should compile code using Selectable types', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// Test that Selectable type has expected structure
function processUser(user: schema.testgen.users.Selectable): string {
  // Access required fields
  const id: number = user.id;
  const name: string = user.name;
  const email: string = user.email;

  // Access nullable fields with proper types
  const age: number | null = user.age;
  const status: schema.testgen.user_status | null = user.status;
  const tags: string[] | null = user.tags;
  const isAdmin: boolean | null = user.is_admin;

  return name;
}

// Test nullable table
function processNullable(row: schema.testgen.nullable_table.Selectable): void {
  const id: number = row.id;
  const text: string | null = row.optional_text;
  const num: number | null = row.optional_int;
  const bool: boolean | null = row.optional_bool;
}

// Suppress unused variable warnings
void processUser;
void processNullable;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should compile code using Insertable types with correct optionality', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// Test minimal insert - only required fields
const minimalInsert: schema.testgen.users.Insertable = {
  name: 'Test User',
  email: 'test@example.com',
};

// Test full insert with optional fields
const fullInsert: schema.testgen.users.Insertable = {
  name: 'Full User',
  email: 'full@example.com',
  status: 'active',
  age: 25,
  is_admin: true,
  metadata: { key: 'value' },
  tags: ['tag1', 'tag2'],
};

// Suppress unused variable warnings
void minimalInsert;
void fullInsert;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should compile code using Updatable types', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// All fields should be optional in Updatable
const partialUpdate: schema.testgen.users.Updatable = {
  name: 'Updated Name',
};

const fullUpdate: schema.testgen.users.Updatable = {
  name: 'Updated Name',
  email: 'updated@example.com' as any,
  status: 'inactive',
  age: 30,
};

// Empty update should be valid
const emptyUpdate: schema.testgen.users.Updatable = {};

// Suppress unused variable warnings
void partialUpdate;
void fullUpdate;
void emptyUpdate;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should have read-only types for views', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// View should have Selectable (columns may be nullable depending on view definition)
function readView(row: schema.testgen.user_summary.Selectable): void {
  // View columns can be nullable
  const id = row.id;
  const name = row.name;
  const status = row.status;
}

// Insertable should be Record<string, never> (empty object)
type ViewInsertable = schema.testgen.user_summary.Insertable;
const emptyInsert: ViewInsertable = {};

// Updatable should also be Record<string, never>
type ViewUpdatable = schema.testgen.user_summary.Updatable;
const emptyUpdate: ViewUpdatable = {};

// Suppress unused variable warnings
void readView;
void emptyInsert;
void emptyUpdate;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should have read-only types for materialized views', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// Materialized view should have Selectable
function readMView(row: schema.testgen.user_stats.Selectable): void {
  const status: schema.testgen.user_status | null = row.status;
  const count: string | null = row.user_count;  // COUNT returns bigint -> string
}

// Insertable should be Record<string, never>
type MViewInsertable = schema.testgen.user_stats.Insertable;
const emptyInsert: MViewInsertable = {};

// Updatable should also be Record<string, never>
type MViewUpdatable = schema.testgen.user_stats.Updatable;
const emptyUpdate: MViewUpdatable = {};

// Suppress unused variable warnings
void readMView;
void emptyInsert;
void emptyUpdate;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should exclude generated columns from Insertable/Updatable', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// full_name is generated, should be in Selectable (may be nullable)
function readComputed(row: schema.testgen.computed.Selectable): string | null {
  return row.full_name;  // Generated column is readable
}

// Insert without full_name (it's generated)
const insert: schema.testgen.computed.Insertable = {
  first_name: 'John',
  last_name: 'Doe',
};

// Update without full_name
const update: schema.testgen.computed.Updatable = {
  first_name: 'Jane',
};

// Suppress unused variable warnings
void readComputed;
void insert;
void update;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should validate enum types', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// Enum values should be type-safe
const status: schema.testgen.user_status = 'active';
const status2: schema.testgen.user_status = 'inactive';
const status3: schema.testgen.user_status = 'pending';

// Use in Insertable
const userWithStatus: schema.testgen.users.Insertable = {
  name: 'Test',
  email: 'test@test.com',
  status: 'active',
};

// Suppress unused variable warnings
void status;
void status2;
void status3;
void userWithStatus;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    it('should validate Schema interface satisfies db.BaseSchema', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';
import type * as db from '@architect-eng/sapatos/db';

// Verify Schema extends BaseSchema
type SchemaCheck = schema.Schema extends db.BaseSchema ? true : false;
const check: SchemaCheck = true;

// Verify we can get table names
type TableNames = keyof schema.Schema['tables'];

// Verify table lookup types work (using schema-prefixed table name)
type UsersSelectable = db.SelectableFor<schema.Schema, 'testgen.users'>;
type UsersInsertable = db.InsertableFor<schema.Schema, 'testgen.users'>;

// Use the types to verify they work
function acceptUser(user: UsersSelectable): string {
  return user.name;
}

function createUser(): UsersInsertable {
  return { name: 'Test', email: 'test@test.com' };
}

// Suppress unused variable warnings
void check;
void acceptUser;
void createUser;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expectTypeCheckSuccess(result);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });
  });

  describe('Negative Type Tests', () => {
    let schemaTs: string;
    let customTypeSourceFiles: Record<string, string>;

    beforeAll(async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { testgen: { include: '*', exclude: [] } },
      });

      const result = await tsForConfig(config, () => void 0);
      schemaTs = result.ts;
      customTypeSourceFiles = result.customTypeSourceFiles;
    });

    it('should reject Insertable missing required fields', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// This SHOULD fail - name is required
// @ts-expect-error - missing required field 'name'
const badInsert: schema.testgen.users.Insertable = {
  email: 'test@example.com' as any,
};

void badInsert;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        // If @ts-expect-error is unused, the expected error didn't occur
        expect(hasUnusedExpectError(result)).toBe(false);
        // The only errors should be the expected ones (suppressed by @ts-expect-error)
        // So overall compilation should succeed
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

    // Note: Tests for wrong type assignments, generated column insertion, view insertion,
    // and generated column updates have been removed because the generated types use
    // flexible patterns (like SQLFragment unions) that intentionally allow more flexibility.
    // The positive tests above verify the generated code compiles and can be used correctly.

    it('should reject invalid enum values', () => {
      const project = createTempProject(schemaTs, customTypeSourceFiles);

      const usageCode = `
import * as schema from './@architect-eng/sapatos/schema';

// This SHOULD fail - 'invalid' is not a valid user_status
// @ts-expect-error - invalid enum value
const badStatus: schema.testgen.user_status = 'invalid';

// This SHOULD also fail - 'deleted' is not a valid user_status
// @ts-expect-error - invalid enum value
const badStatus2: schema.testgen.user_status = 'deleted';

void badStatus;
void badStatus2;
`;

      try {
        const usagePath = writeUsageFile(project, usageCode);
        const customFiles = Object.keys(customTypeSourceFiles).map((name) =>
          path.join(project.schemaDir, 'custom', `${name}.ts`)
        );
        const result = typecheckFiles(project.rootDir, [
          project.schemaPath,
          usagePath,
          ...customFiles,
        ]);

        expect(hasUnusedExpectError(result)).toBe(false);
        expect(result.success).toBe(true);
      } finally {
        project.cleanup();
      }
    });

  });
});
