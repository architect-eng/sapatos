import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDatabase, stopTestDatabase, getTestPool, getTestConnectionConfig } from '../test-helpers/integration-db';
import type { Config } from './config';
import { generate } from './write';

describe('Type Generation - End-to-End Integration Tests', () => {
  let pool: Pool;
  let testOutputDir: string;

  beforeAll(async () => {
    // Use shared test database infrastructure
    await startTestDatabase();
    pool = getTestPool();

    // Create a unique temp directory for test outputs
    testOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapatos-test-'));
  }, 60000);

  afterAll(async () => {
    // Clean up test output directory
    if (fs.existsSync(testOutputDir)) {
      fs.rmSync(testOutputDir, { recursive: true, force: true });
    }

    // Use shared cleanup (properly closes pool before stopping container)
    await stopTestDatabase();
  }, 60000);

  /**
   * Helper: Create a clean output directory for a test
   */
  const createTestOutputDir = (testName: string): string => {
    const dir = path.join(testOutputDir, testName);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };

  /**
   * Helper: Get generated schema file content
   */
  const readGeneratedSchema = (outDir: string): string => {
    const schemaPath = path.join(outDir, 'sapatos', 'schema.d.ts');
    expect(fs.existsSync(schemaPath), `Schema file should exist at ${schemaPath}`).toBe(true);
    return fs.readFileSync(schemaPath, 'utf-8');
  };

  /**
   * Helper: Check if custom type file exists
   */
  const customTypeFileExists = (outDir: string, typeName: string): boolean => {
    const customTypePath = path.join(outDir, 'sapatos', 'custom', `${typeName}.d.ts`);
    return fs.existsSync(customTypePath);
  };

  /**
   * Helper: Create base config for tests
   */
  const createBaseConfig = (outDir: string): Config => ({
    db: getTestConnectionConfig(),
    outDir,
    schemas: {
      public: { include: '*', exclude: [] },
    },
  });

  describe('Basic Schema Generation', () => {
    it('generates types for simple table with common column types', async () => {
      const outDir = createTestOutputDir('basic-table');

      // Create a simple users table
      await pool.query(`
        DROP TABLE IF EXISTS users CASCADE;
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          age INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify table is in StructureMap
      expect(schema).toContain("interface StructureMap");
      expect(schema).toMatch(/'users':\s*{/);

      // Verify all required type properties exist
      expect(schema).toContain("Table: 'users'");
      expect(schema).toMatch(/'users':[\s\S]*Selectable:/);
      expect(schema).toMatch(/'users':[\s\S]*Insertable:/);
      expect(schema).toMatch(/'users':[\s\S]*Updatable:/);
      expect(schema).toMatch(/'users':[\s\S]*Whereable:/);
      expect(schema).toMatch(/'users':[\s\S]*JSONSelectable:/);

      // Verify column types
      expect(schema).toContain("id: number");
      expect(schema).toContain("name: string");
      expect(schema).toContain("email: string");
      expect(schema).toMatch(/age: number \| null/);

      // Verify namespace alias exists
      expect(schema).toContain('export namespace users');
    }, 60000);

    it('generates types for multiple related tables', async () => {
      const outDir = createTestOutputDir('related-tables');

      // Create users, posts, and comments tables with foreign keys
      await pool.query(`
        DROP TABLE IF EXISTS comments CASCADE;
        DROP TABLE IF EXISTS posts CASCADE;
        DROP TABLE IF EXISTS users CASCADE;

        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE
        );

        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          content TEXT,
          published BOOLEAN DEFAULT FALSE
        );

        CREATE TABLE comments (
          id SERIAL PRIMARY KEY,
          post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          content TEXT NOT NULL
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify all three tables are present
      expect(schema).toMatch(/'users':\s*{/);
      expect(schema).toMatch(/'posts':\s*{/);
      expect(schema).toMatch(/'comments':\s*{/);

      // Verify foreign key columns have correct types
      expect(schema).toMatch(/'posts':[\s\S]*user_id: number/);
      expect(schema).toMatch(/'comments':[\s\S]*post_id: number/);
      expect(schema).toMatch(/'comments':[\s\S]*user_id: number/);

      // Verify all tables are in StructureMap (union types are now in runtime module)
      expect(schema).toContain("interface StructureMap {");
      expect(schema).toContain("'users':");
      expect(schema).toContain("'posts':");
      expect(schema).toContain("'comments':");
    }, 60000);

    it('handles nullable and non-nullable columns correctly', async () => {
      const outDir = createTestOutputDir('nullable-columns');

      await pool.query(`
        DROP TABLE IF EXISTS test_nullability CASCADE;
        CREATE TABLE test_nullability (
          id SERIAL PRIMARY KEY,
          required_field TEXT NOT NULL,
          optional_field TEXT,
          required_number INTEGER NOT NULL,
          optional_number INTEGER
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Required fields should not have null union
      expect(schema).toMatch(/'test_nullability':[\s\S]*required_field: string[^|]/);
      expect(schema).toMatch(/'test_nullability':[\s\S]*required_number: number[^|]/);

      // Optional fields should have null union
      expect(schema).toMatch(/'test_nullability':[\s\S]*optional_field: string \| null/);
      expect(schema).toMatch(/'test_nullability':[\s\S]*optional_number: number \| null/);
    }, 60000);
  });

  describe('Complex Types and Features', () => {
    it('generates enum types and uses them in tables', async () => {
      const outDir = createTestOutputDir('enum-types');

      await pool.query(`
        DROP TABLE IF EXISTS users CASCADE;
        DROP TYPE IF EXISTS user_role CASCADE;
        DROP TYPE IF EXISTS user_status CASCADE;

        CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'user');
        CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');

        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          role user_role NOT NULL DEFAULT 'user',
          status user_status NOT NULL DEFAULT 'active'
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify enum types are defined
      expect(schema).toContain("export type user_role = 'admin' | 'moderator' | 'user'");
      expect(schema).toContain("export type user_status = 'active' | 'inactive' | 'suspended'");

      // Verify table uses enum types
      expect(schema).toMatch(/'users':[\s\S]*role: user_role/);
      expect(schema).toMatch(/'users':[\s\S]*status: user_status/);
    }, 60000);

    it('handles array types correctly', async () => {
      const outDir = createTestOutputDir('array-types');

      await pool.query(`
        DROP TABLE IF EXISTS test_arrays CASCADE;
        CREATE TABLE test_arrays (
          id SERIAL PRIMARY KEY,
          tags TEXT[] NOT NULL,
          numbers INTEGER[],
          matrix INTEGER[][]
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify array types
      expect(schema).toMatch(/'test_arrays':[\s\S]*tags: string\[\]/);
      expect(schema).toMatch(/'test_arrays':[\s\S]*numbers: number\[\] \| null/);
      // Note: PostgreSQL doesn't distinguish INTEGER[] from INTEGER[][] at the type level
      // Both are stored as _int4 (array of int4), so both generate as number[]
      expect(schema).toMatch(/'test_arrays':[\s\S]*matrix: number\[\] \| null/);
    }, 60000);

    it('handles JSON and JSONB columns', async () => {
      const outDir = createTestOutputDir('json-types');

      await pool.query(`
        DROP TABLE IF EXISTS test_json CASCADE;
        CREATE TABLE test_json (
          id SERIAL PRIMARY KEY,
          metadata JSON NOT NULL,
          settings JSONB,
          config JSONB NOT NULL DEFAULT '{}'::jsonb
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify JSON types use db.JSONValue
      expect(schema).toMatch(/'test_json':[\s\S]*metadata: db\.JSONValue/);
      expect(schema).toMatch(/'test_json':[\s\S]*settings: db\.JSONValue \| null/);
      expect(schema).toMatch(/'test_json':[\s\S]*config: db\.JSONValue/);
    }, 60000);

    it('handles generated columns (not insertable/updatable)', async () => {
      const outDir = createTestOutputDir('generated-columns');

      await pool.query(`
        DROP TABLE IF EXISTS test_generated CASCADE;
        CREATE TABLE test_generated (
          id SERIAL PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify Selectable includes generated column
      expect(schema).toMatch(/'test_generated':[\s\S]*Selectable:[\s\S]*full_name: string/);

      // Generated columns should not appear in Insertable or Updatable
      // (They should be omitted or the types should prevent their use)
      const insertableMatch = schema.match(/'test_generated':[\s\S]*?Insertable:\s*{([^}]*)}/);
      if (insertableMatch) {
        expect(insertableMatch[1]).not.toContain('full_name');
      }
    }, 60000);

    it('handles custom domains and creates placeholder files', async () => {
      const outDir = createTestOutputDir('custom-domains');

      await pool.query(`
        DROP TABLE IF EXISTS test_custom CASCADE;
        DROP DOMAIN IF EXISTS email_address CASCADE;
        DROP DOMAIN IF EXISTS positive_integer CASCADE;

        CREATE DOMAIN email_address AS TEXT CHECK (VALUE ~ '^[^@]+@[^@]+\\.[^@]+$');
        CREATE DOMAIN positive_integer AS INTEGER CHECK (VALUE > 0);

        CREATE TABLE test_custom (
          id SERIAL PRIMARY KEY,
          email email_address NOT NULL,
          score positive_integer
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify custom types are imported
      expect(schema).toContain("import type * as c from '@architect-eng/sapatos/custom'");

      // Verify custom types are used in table definition
      expect(schema).toMatch(/'test_custom':[\s\S]*email: c\.PgEmail_address/);
      expect(schema).toMatch(/'test_custom':[\s\S]*score: c\.PgPositive_integer \| null/);

      // Verify placeholder files are created
      expect(customTypeFileExists(outDir, 'PgEmail_address')).toBe(true);
      expect(customTypeFileExists(outDir, 'PgPositive_integer')).toBe(true);

      // Verify custom type files have correct structure
      const emailTypePath = path.join(outDir, 'sapatos', 'custom', 'PgEmail_address.d.ts');
      const emailTypeContent = fs.readFileSync(emailTypePath, 'utf-8');
      expect(emailTypeContent).toContain("export type PgEmail_address = string");
      expect(emailTypeContent).toContain("Please edit this file as needed");
    }, 60000);

    it('handles views and materialized views', async () => {
      const outDir = createTestOutputDir('views');

      await pool.query(`
        DROP MATERIALIZED VIEW IF EXISTS user_stats_mv CASCADE;
        DROP VIEW IF EXISTS active_users CASCADE;
        DROP TABLE IF EXISTS users CASCADE;

        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          active BOOLEAN DEFAULT TRUE,
          login_count INTEGER DEFAULT 0
        );

        CREATE VIEW active_users AS
          SELECT id, name, email FROM users WHERE active = TRUE;

        CREATE MATERIALIZED VIEW user_stats_mv AS
          SELECT
            COUNT(*) as total_users,
            SUM(login_count) as total_logins
          FROM users;
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify view is present
      expect(schema).toMatch(/'active_users':\s*{/);
      expect(schema).toMatch(/'active_users':[\s\S]*Table: 'active_users'/);

      // Verify materialized view is present
      expect(schema).toMatch(/'user_stats_mv':\s*{/);

      // Views should have limited or no Insertable/Updatable types
      // (The exact behavior depends on PostgreSQL's determination of updatability)
    }, 60000);
  });

  describe('Multi-Schema and Configuration', () => {
    it('handles multiple schemas with prefixing', async () => {
      const outDir = createTestOutputDir('multi-schema');

      // Create two schemas with tables
      await pool.query(`
        DROP SCHEMA IF EXISTS app CASCADE;
        DROP SCHEMA IF EXISTS audit CASCADE;

        CREATE SCHEMA app;
        CREATE SCHEMA audit;

        CREATE TABLE app.users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE audit.logs (
          id SERIAL PRIMARY KEY,
          action TEXT NOT NULL,
          timestamp TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      const config: Config = {
        db: getTestConnectionConfig(),
        outDir,
        schemas: {
          app: { include: '*', exclude: [] },
          audit: { include: '*', exclude: [] },
        },
        unprefixedSchema: null, // All schemas should be prefixed
      };

      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify both schemas are present with prefixes
      expect(schema).toMatch(/'app\.users':\s*{/);
      expect(schema).toMatch(/'audit\.logs':\s*{/);

      // Verify Table type includes prefixed names
      expect(schema).toMatch(/Table: 'app\.users'/);
      expect(schema).toMatch(/Table: 'audit\.logs'/);
    }, 60000);

    it('handles unprefixed schema configuration', async () => {
      const outDir = createTestOutputDir('unprefixed-schema');

      await pool.query(`
        DROP TABLE IF EXISTS products CASCADE;
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          price DECIMAL(10, 2) NOT NULL
        );
      `);

      const config: Config = {
        db: getTestConnectionConfig(),
        outDir,
        schemas: {
          public: { include: '*', exclude: [] },
        },
        unprefixedSchema: 'public', // public schema should be unprefixed
      };

      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify table name is NOT prefixed
      expect(schema).toMatch(/'products':\s*{/);
      expect(schema).toMatch(/Table: 'products'/);
      expect(schema).not.toContain("'public.products'");
    }, 60000);

    it('respects include and exclude rules', async () => {
      const outDir = createTestOutputDir('include-exclude');

      await pool.query(`
        DROP TABLE IF EXISTS included_table CASCADE;
        DROP TABLE IF EXISTS excluded_table CASCADE;
        DROP TABLE IF EXISTS another_included CASCADE;

        CREATE TABLE included_table (id SERIAL PRIMARY KEY);
        CREATE TABLE excluded_table (id SERIAL PRIMARY KEY);
        CREATE TABLE another_included (id SERIAL PRIMARY KEY);
      `);

      const config: Config = {
        db: getTestConnectionConfig(),
        outDir,
        schemas: {
          public: {
            include: ['included_table', 'another_included'],
            exclude: [],
          },
        },
      };

      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify included tables are present
      expect(schema).toMatch(/'included_table':\s*{/);
      expect(schema).toMatch(/'another_included':\s*{/);

      // Verify excluded table is NOT present
      expect(schema).not.toContain("'excluded_table'");
    }, 60000);

    it('handles exclude: "*" to skip schema entirely', async () => {
      const outDir = createTestOutputDir('exclude-all');

      await pool.query(`
        DROP TABLE IF EXISTS some_table CASCADE;
        CREATE TABLE some_table (id SERIAL PRIMARY KEY);
      `);

      const config: Config = {
        db: getTestConnectionConfig(),
        outDir,
        schemas: {
          public: { include: '*', exclude: '*' },
        },
      };

      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Schema should not contain any table from public schema
      expect(schema).not.toContain("'some_table'");

      // StructureMap should be empty or minimal
      expect(schema).toContain('interface StructureMap');
    }, 60000);
  });

  describe('Edge Cases and Validation', () => {
    it('handles empty schema (no tables)', async () => {
      const outDir = createTestOutputDir('empty-schema');

      // Drop all tables to ensure empty schema
      await pool.query(`
        DROP TABLE IF EXISTS comments CASCADE;
        DROP TABLE IF EXISTS posts CASCADE;
        DROP TABLE IF EXISTS users CASCADE;
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Should still generate valid TypeScript
      expect(schema).toContain('interface StructureMap');
      expect(schema).toContain("CRITICAL: DO NOT EDIT THIS FILE");

      // Should have empty StructureMap (union types are now in runtime module)
      expect(schema).toContain('interface StructureMap {');
      // Union types are no longer generated (they're in the runtime module)
      expect(schema).not.toContain('export type Table = keyof StructureMap');
    }, 60000);

    it('generates schema version canary', async () => {
      const outDir = createTestOutputDir('version-canary');

      await pool.query(`
        DROP TABLE IF EXISTS test CASCADE;
        CREATE TABLE test (id SERIAL PRIMARY KEY);
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify version canary exists
      expect(schema).toContain('export interface schemaVersionCanary');
      expect(schema).toContain('extends db.SchemaVersionCanary');
      expect(schema).toMatch(/version:\s*\d+/);
    }, 60000);

    it('preserves existing custom type files (does not overwrite)', async () => {
      const outDir = createTestOutputDir('preserve-custom-types');

      await pool.query(`
        DROP TABLE IF EXISTS test CASCADE;
        DROP DOMAIN IF EXISTS my_custom CASCADE;

        CREATE DOMAIN my_custom AS TEXT;

        CREATE TABLE test (
          id SERIAL PRIMARY KEY,
          value my_custom
        );
      `);

      const config = createBaseConfig(outDir);

      // First generation
      await generate(config, pool);

      // Modify the custom type file
      const customTypePath = path.join(outDir, 'sapatos', 'custom', 'PgMy_custom.d.ts');
      const modifiedContent = `// CUSTOM MODIFICATION\nexport type PgMy_custom = string;`;
      fs.writeFileSync(customTypePath, modifiedContent);

      // Second generation (should not overwrite)
      await generate(config, pool);

      // Verify custom file was preserved
      const finalContent = fs.readFileSync(customTypePath, 'utf-8');
      expect(finalContent).toContain('CUSTOM MODIFICATION');
    }, 60000);

    it('generates valid TypeScript that would compile', async () => {
      const outDir = createTestOutputDir('valid-typescript');

      // Create a comprehensive schema
      await pool.query(`
        DROP TABLE IF EXISTS comprehensive CASCADE;
        DROP TYPE IF EXISTS status_enum CASCADE;

        CREATE TYPE status_enum AS ENUM ('pending', 'active', 'archived');

        CREATE TABLE comprehensive (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          email TEXT,
          age INTEGER,
          tags TEXT[] NOT NULL DEFAULT '{}',
          metadata JSONB,
          status status_enum NOT NULL DEFAULT 'pending',
          score DECIMAL(5, 2),
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ
        );
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Basic validation that it's valid TypeScript structure (now uses db module augmentation)
      expect(schema).toContain("declare module '@architect-eng/sapatos/db'");
      expect(schema).toContain('interface StructureMap');
      expect(schema).toContain('export namespace comprehensive');

      // No obvious syntax errors
      expect(schema).not.toContain('undefined');
      expect(schema).not.toContain('null null');

      // Proper module augmentation structure
      const moduleDeclarationCount = (schema.match(/declare module/g) || []).length;
      expect(moduleDeclarationCount).toBeGreaterThan(0);
    }, 60000);
  });

  describe('End-to-End Type Safety Validation', () => {
    it('generated types work with actual database queries', async () => {
      const outDir = createTestOutputDir('e2e-type-safety');

      // Create a simple schema
      await pool.query(`
        DROP TABLE IF EXISTS products CASCADE;
        CREATE TABLE products (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          in_stock BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );

        INSERT INTO products (name, price, in_stock)
        VALUES ('Widget', 19.99, true), ('Gadget', 29.99, false);
      `);

      const config = createBaseConfig(outDir);
      await generate(config, pool);

      const schema = readGeneratedSchema(outDir);

      // Verify types exist for runtime queries
      expect(schema).toContain("export namespace products");
      expect(schema).toMatch(/'products':[\s\S]*Selectable:/);
      expect(schema).toMatch(/'products':[\s\S]*Insertable:/);
      expect(schema).toMatch(/'products':[\s\S]*Updatable:/);
      expect(schema).toMatch(/'products':[\s\S]*Whereable:/);

      // Verify the types have the correct shape
      expect(schema).toMatch(/name: string/);
      expect(schema).toMatch(/price: number/); // DECIMAL maps to number
      expect(schema).toMatch(/in_stock: boolean \| null/);

      // We can't actually import and use the types in this test without compilation,
      // but we've verified the structure is correct for runtime use

      expect(schema).toMatchInlineSnapshot(`
        "/*
        **CRITICAL: DO NOT EDIT THIS FILE**
        This is code that is generated by Sapatos and your changes will be overwritten
        */

        declare module '@architect-eng/sapatos/db' {
          import type * as c from '@architect-eng/sapatos/custom';

          // got a type error on schemaVersionCanary below? update by running \`npx @architect-eng/sapatos\`
          export interface schemaVersionCanary extends db.SchemaVersionCanary { version: 105 }


          /* --- enums --- */

          export type status_enum = 'active' | 'archived' | 'pending';
          export namespace every {
            export type status_enum = ['active', 'archived', 'pending'];
          }
          export type user_role = 'admin' | 'moderator' | 'user';
          export namespace every {
            export type user_role = ['admin', 'moderator', 'user'];
          }
          export type user_status = 'active' | 'inactive' | 'suspended';
          export namespace every {
            export type user_status = ['active', 'inactive', 'suspended'];
          }

          /* --- SQLExpression helper types --- */
          type another_includedSQLExpression = 'another_included' | ColumnNames<StructureMap['another_included']['Updatable'] | (keyof StructureMap['another_included']['Updatable'])[]> | ColumnValues<StructureMap['another_included']['Updatable']> | StructureMap['another_included']['Whereable'] | StructureMap['another_included']['Column'] | ParentColumn | GenericSQLExpression;
            type comprehensiveSQLExpression = 'comprehensive' | ColumnNames<StructureMap['comprehensive']['Updatable'] | (keyof StructureMap['comprehensive']['Updatable'])[]> | ColumnValues<StructureMap['comprehensive']['Updatable']> | StructureMap['comprehensive']['Whereable'] | StructureMap['comprehensive']['Column'] | ParentColumn | GenericSQLExpression;
            type excluded_tableSQLExpression = 'excluded_table' | ColumnNames<StructureMap['excluded_table']['Updatable'] | (keyof StructureMap['excluded_table']['Updatable'])[]> | ColumnValues<StructureMap['excluded_table']['Updatable']> | StructureMap['excluded_table']['Whereable'] | StructureMap['excluded_table']['Column'] | ParentColumn | GenericSQLExpression;
            type included_tableSQLExpression = 'included_table' | ColumnNames<StructureMap['included_table']['Updatable'] | (keyof StructureMap['included_table']['Updatable'])[]> | ColumnValues<StructureMap['included_table']['Updatable']> | StructureMap['included_table']['Whereable'] | StructureMap['included_table']['Column'] | ParentColumn | GenericSQLExpression;
            type productsSQLExpression = 'products' | ColumnNames<StructureMap['products']['Updatable'] | (keyof StructureMap['products']['Updatable'])[]> | ColumnValues<StructureMap['products']['Updatable']> | StructureMap['products']['Whereable'] | StructureMap['products']['Column'] | ParentColumn | GenericSQLExpression;
            type some_tableSQLExpression = 'some_table' | ColumnNames<StructureMap['some_table']['Updatable'] | (keyof StructureMap['some_table']['Updatable'])[]> | ColumnValues<StructureMap['some_table']['Updatable']> | StructureMap['some_table']['Whereable'] | StructureMap['some_table']['Column'] | ParentColumn | GenericSQLExpression;
            type testSQLExpression = 'test' | ColumnNames<StructureMap['test']['Updatable'] | (keyof StructureMap['test']['Updatable'])[]> | ColumnValues<StructureMap['test']['Updatable']> | StructureMap['test']['Whereable'] | StructureMap['test']['Column'] | ParentColumn | GenericSQLExpression;
            type test_arraysSQLExpression = 'test_arrays' | ColumnNames<StructureMap['test_arrays']['Updatable'] | (keyof StructureMap['test_arrays']['Updatable'])[]> | ColumnValues<StructureMap['test_arrays']['Updatable']> | StructureMap['test_arrays']['Whereable'] | StructureMap['test_arrays']['Column'] | ParentColumn | GenericSQLExpression;
            type test_customSQLExpression = 'test_custom' | ColumnNames<StructureMap['test_custom']['Updatable'] | (keyof StructureMap['test_custom']['Updatable'])[]> | ColumnValues<StructureMap['test_custom']['Updatable']> | StructureMap['test_custom']['Whereable'] | StructureMap['test_custom']['Column'] | ParentColumn | GenericSQLExpression;
            type test_generatedSQLExpression = 'test_generated' | ColumnNames<StructureMap['test_generated']['Updatable'] | (keyof StructureMap['test_generated']['Updatable'])[]> | ColumnValues<StructureMap['test_generated']['Updatable']> | StructureMap['test_generated']['Whereable'] | StructureMap['test_generated']['Column'] | ParentColumn | GenericSQLExpression;
            type test_jsonSQLExpression = 'test_json' | ColumnNames<StructureMap['test_json']['Updatable'] | (keyof StructureMap['test_json']['Updatable'])[]> | ColumnValues<StructureMap['test_json']['Updatable']> | StructureMap['test_json']['Whereable'] | StructureMap['test_json']['Column'] | ParentColumn | GenericSQLExpression;
            type test_nullabilitySQLExpression = 'test_nullability' | ColumnNames<StructureMap['test_nullability']['Updatable'] | (keyof StructureMap['test_nullability']['Updatable'])[]> | ColumnValues<StructureMap['test_nullability']['Updatable']> | StructureMap['test_nullability']['Whereable'] | StructureMap['test_nullability']['Column'] | ParentColumn | GenericSQLExpression;

          /* --- StructureMap augmentation --- */
          interface StructureMap {
            'another_included': {
              Table: 'another_included';
              Selectable: {
                /**
              * **another_included.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('another_included_id_seq'::regclass)\`
              */
              id: number;
              };
              JSONSelectable: {
                /**
              * **another_included.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('another_included_id_seq'::regclass)\`
              */
              id: number;
              };
              Whereable: {
                /**
              * **another_included.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('another_included_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **another_included.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('another_included_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **another_included.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('another_included_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'another_included_pkey';
              Column: id;
              SQL: another_includedSQLExpression;
            };
            'comprehensive': {
              Table: 'comprehensive';
              Selectable: {
                /**
              * **comprehensive.age**
              * - \`int4\` in database
              * - Nullable, no default
              */
              age: number | null;
                /**
              * **comprehensive.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at: Date | null;
                /**
              * **comprehensive.email**
              * - \`text\` in database
              * - Nullable, no default
              */
              email: string | null;
                /**
              * **comprehensive.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('comprehensive_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **comprehensive.is_active**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              is_active: boolean | null;
                /**
              * **comprehensive.metadata**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              metadata: db.JSONValue | null;
                /**
              * **comprehensive.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string;
                /**
              * **comprehensive.score**
              * - \`numeric\` in database
              * - Nullable, no default
              */
              score: db.NumericString | null;
                /**
              * **comprehensive.status**
              * - \`status_enum\` in database
              * - \`NOT NULL\`, default: \`'pending'::status_enum\`
              */
              status: status_enum;
                /**
              * **comprehensive.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, default: \`'{}'::text[]\`
              */
              tags: string[];
                /**
              * **comprehensive.updated_at**
              * - \`timestamptz\` in database
              * - Nullable, no default
              */
              updated_at: Date | null;
              };
              JSONSelectable: {
                /**
              * **comprehensive.age**
              * - \`int4\` in database
              * - Nullable, no default
              */
              age: number | null;
                /**
              * **comprehensive.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at: db.TimestampTzString | null;
                /**
              * **comprehensive.email**
              * - \`text\` in database
              * - Nullable, no default
              */
              email: string | null;
                /**
              * **comprehensive.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('comprehensive_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **comprehensive.is_active**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              is_active: boolean | null;
                /**
              * **comprehensive.metadata**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              metadata: db.JSONValue | null;
                /**
              * **comprehensive.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string;
                /**
              * **comprehensive.score**
              * - \`numeric\` in database
              * - Nullable, no default
              */
              score: number | null;
                /**
              * **comprehensive.status**
              * - \`status_enum\` in database
              * - \`NOT NULL\`, default: \`'pending'::status_enum\`
              */
              status: status_enum;
                /**
              * **comprehensive.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, default: \`'{}'::text[]\`
              */
              tags: string[];
                /**
              * **comprehensive.updated_at**
              * - \`timestamptz\` in database
              * - Nullable, no default
              */
              updated_at: db.TimestampTzString | null;
              };
              Whereable: {
                /**
              * **comprehensive.age**
              * - \`int4\` in database
              * - Nullable, no default
              */
              age?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.email**
              * - \`text\` in database
              * - Nullable, no default
              */
              email?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('comprehensive_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.is_active**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              is_active?: boolean | db.Parameter<boolean> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, boolean | db.Parameter<boolean> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.metadata**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              metadata?: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.score**
              * - \`numeric\` in database
              * - Nullable, no default
              */
              score?: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.status**
              * - \`status_enum\` in database
              * - \`NOT NULL\`, default: \`'pending'::status_enum\`
              */
              status?: status_enum | db.Parameter<status_enum> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, status_enum | db.Parameter<status_enum> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, default: \`'{}'::text[]\`
              */
              tags?: string[] | db.Parameter<string[]> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string[] | db.Parameter<string[]> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **comprehensive.updated_at**
              * - \`timestamptz\` in database
              * - Nullable, no default
              */
              updated_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **comprehensive.age**
              * - \`int4\` in database
              * - Nullable, no default
              */
              age?: number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.email**
              * - \`text\` in database
              * - Nullable, no default
              */
              email?: string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('comprehensive_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.is_active**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              is_active?: boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.metadata**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              metadata?: db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string | db.Parameter<string> | db.SQLFragment;
                /**
              * **comprehensive.score**
              * - \`numeric\` in database
              * - Nullable, no default
              */
              score?: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | null | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.status**
              * - \`status_enum\` in database
              * - \`NOT NULL\`, default: \`'pending'::status_enum\`
              */
              status?: status_enum | db.Parameter<status_enum> | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, default: \`'{}'::text[]\`
              */
              tags?: string[] | db.Parameter<string[]> | db.DefaultType | db.SQLFragment;
                /**
              * **comprehensive.updated_at**
              * - \`timestamptz\` in database
              * - Nullable, no default
              */
              updated_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **comprehensive.age**
              * - \`int4\` in database
              * - Nullable, no default
              */
              age?: number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.email**
              * - \`text\` in database
              * - Nullable, no default
              */
              email?: string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('comprehensive_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.is_active**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              is_active?: boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.metadata**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              metadata?: db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name?: string | db.Parameter<string> | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment>;
                /**
              * **comprehensive.score**
              * - \`numeric\` in database
              * - Nullable, no default
              */
              score?: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.status**
              * - \`status_enum\` in database
              * - \`NOT NULL\`, default: \`'pending'::status_enum\`
              */
              status?: status_enum | db.Parameter<status_enum> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, status_enum | db.Parameter<status_enum> | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, default: \`'{}'::text[]\`
              */
              tags?: string[] | db.Parameter<string[]> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, string[] | db.Parameter<string[]> | db.DefaultType | db.SQLFragment>;
                /**
              * **comprehensive.updated_at**
              * - \`timestamptz\` in database
              * - Nullable, no default
              */
              updated_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'comprehensive_pkey';
              Column: age | created_at | email | id | is_active | metadata | name | score | status | tags | updated_at;
              SQL: comprehensiveSQLExpression;
            };
            'excluded_table': {
              Table: 'excluded_table';
              Selectable: {
                /**
              * **excluded_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('excluded_table_id_seq'::regclass)\`
              */
              id: number;
              };
              JSONSelectable: {
                /**
              * **excluded_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('excluded_table_id_seq'::regclass)\`
              */
              id: number;
              };
              Whereable: {
                /**
              * **excluded_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('excluded_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **excluded_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('excluded_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **excluded_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('excluded_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'excluded_table_pkey';
              Column: id;
              SQL: excluded_tableSQLExpression;
            };
            'included_table': {
              Table: 'included_table';
              Selectable: {
                /**
              * **included_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('included_table_id_seq'::regclass)\`
              */
              id: number;
              };
              JSONSelectable: {
                /**
              * **included_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('included_table_id_seq'::regclass)\`
              */
              id: number;
              };
              Whereable: {
                /**
              * **included_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('included_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **included_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('included_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **included_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('included_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'included_table_pkey';
              Column: id;
              SQL: included_tableSQLExpression;
            };
            'products': {
              Table: 'products';
              Selectable: {
                /**
              * **products.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at: Date | null;
                /**
              * **products.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('products_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **products.in_stock**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              in_stock: boolean | null;
                /**
              * **products.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string;
                /**
              * **products.price**
              * - \`numeric\` in database
              * - \`NOT NULL\`, no default
              */
              price: db.NumericString;
              };
              JSONSelectable: {
                /**
              * **products.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at: db.TimestampTzString | null;
                /**
              * **products.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('products_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **products.in_stock**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              in_stock: boolean | null;
                /**
              * **products.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string;
                /**
              * **products.price**
              * - \`numeric\` in database
              * - \`NOT NULL\`, no default
              */
              price: number;
              };
              Whereable: {
                /**
              * **products.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **products.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('products_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **products.in_stock**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              in_stock?: boolean | db.Parameter<boolean> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, boolean | db.Parameter<boolean> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **products.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **products.price**
              * - \`numeric\` in database
              * - \`NOT NULL\`, no default
              */
              price?: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **products.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment;
                /**
              * **products.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('products_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **products.in_stock**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              in_stock?: boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment;
                /**
              * **products.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name: string | db.Parameter<string> | db.SQLFragment;
                /**
              * **products.price**
              * - \`numeric\` in database
              * - \`NOT NULL\`, no default
              */
              price: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment;
              };
              Updatable: {
                /**
              * **products.created_at**
              * - \`timestamptz\` in database
              * - Nullable, default: \`now()\`
              */
              created_at?: (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, (db.TimestampTzString | Date) | db.Parameter<(db.TimestampTzString | Date)> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **products.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('products_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **products.in_stock**
              * - \`bool\` in database
              * - Nullable, default: \`true\`
              */
              in_stock?: boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, boolean | db.Parameter<boolean> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **products.name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              name?: string | db.Parameter<string> | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment>;
                /**
              * **products.price**
              * - \`numeric\` in database
              * - \`NOT NULL\`, no default
              */
              price?: (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment | db.SQLFragment<any, (number | db.NumericString) | db.Parameter<(number | db.NumericString)> | db.SQLFragment>;
              };
              UniqueIndex: 'products_pkey';
              Column: created_at | id | in_stock | name | price;
              SQL: productsSQLExpression;
            };
            'some_table': {
              Table: 'some_table';
              Selectable: {
                /**
              * **some_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('some_table_id_seq'::regclass)\`
              */
              id: number;
              };
              JSONSelectable: {
                /**
              * **some_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('some_table_id_seq'::regclass)\`
              */
              id: number;
              };
              Whereable: {
                /**
              * **some_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('some_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **some_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('some_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **some_table.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('some_table_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'some_table_pkey';
              Column: id;
              SQL: some_tableSQLExpression;
            };
            'test': {
              Table: 'test';
              Selectable: {
                /**
              * **test.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test.value**
              * - \`my_custom\` (base type: \`text\`) in database
              * - Nullable, no default
              */
              value: c.PgMy_custom | null;
              };
              JSONSelectable: {
                /**
              * **test.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test.value**
              * - \`my_custom\` (base type: \`text\`) in database
              * - Nullable, no default
              */
              value: c.PgMy_custom | null;
              };
              Whereable: {
                /**
              * **test.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test.value**
              * - \`my_custom\` (base type: \`text\`) in database
              * - Nullable, no default
              */
              value?: c.PgMy_custom | db.Parameter<c.PgMy_custom> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, c.PgMy_custom | db.Parameter<c.PgMy_custom> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test.value**
              * - \`my_custom\` (base type: \`text\`) in database
              * - Nullable, no default
              */
              value?: c.PgMy_custom | db.Parameter<c.PgMy_custom> | null | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test.value**
              * - \`my_custom\` (base type: \`text\`) in database
              * - Nullable, no default
              */
              value?: c.PgMy_custom | db.Parameter<c.PgMy_custom> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, c.PgMy_custom | db.Parameter<c.PgMy_custom> | null | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'test_pkey';
              Column: id | value;
              SQL: testSQLExpression;
            };
            'test_arrays': {
              Table: 'test_arrays';
              Selectable: {
                /**
              * **test_arrays.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_arrays_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_arrays.matrix**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              matrix: number[] | null;
                /**
              * **test_arrays.numbers**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              numbers: number[] | null;
                /**
              * **test_arrays.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, no default
              */
              tags: string[];
              };
              JSONSelectable: {
                /**
              * **test_arrays.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_arrays_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_arrays.matrix**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              matrix: number[] | null;
                /**
              * **test_arrays.numbers**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              numbers: number[] | null;
                /**
              * **test_arrays.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, no default
              */
              tags: string[];
              };
              Whereable: {
                /**
              * **test_arrays.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_arrays_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_arrays.matrix**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              matrix?: number[] | db.Parameter<number[]> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number[] | db.Parameter<number[]> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_arrays.numbers**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              numbers?: number[] | db.Parameter<number[]> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number[] | db.Parameter<number[]> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_arrays.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, no default
              */
              tags?: string[] | db.Parameter<string[]> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string[] | db.Parameter<string[]> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test_arrays.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_arrays_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test_arrays.matrix**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              matrix?: number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment;
                /**
              * **test_arrays.numbers**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              numbers?: number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment;
                /**
              * **test_arrays.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, no default
              */
              tags: string[] | db.Parameter<string[]> | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test_arrays.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_arrays_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_arrays.matrix**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              matrix?: number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **test_arrays.numbers**
              * - \`_int4\` in database
              * - Nullable, no default
              */
              numbers?: number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number[] | db.Parameter<number[]> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **test_arrays.tags**
              * - \`_text\` in database
              * - \`NOT NULL\`, no default
              */
              tags?: string[] | db.Parameter<string[]> | db.SQLFragment | db.SQLFragment<any, string[] | db.Parameter<string[]> | db.SQLFragment>;
              };
              UniqueIndex: 'test_arrays_pkey';
              Column: id | matrix | numbers | tags;
              SQL: test_arraysSQLExpression;
            };
            'test_custom': {
              Table: 'test_custom';
              Selectable: {
                /**
              * **test_custom.email**
              * - \`email_address\` (base type: \`text\`) in database
              * - \`NOT NULL\`, no default
              */
              email: c.PgEmail_address;
                /**
              * **test_custom.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_custom_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_custom.score**
              * - \`positive_integer\` (base type: \`int4\`) in database
              * - Nullable, no default
              */
              score: c.PgPositive_integer | null;
              };
              JSONSelectable: {
                /**
              * **test_custom.email**
              * - \`email_address\` (base type: \`text\`) in database
              * - \`NOT NULL\`, no default
              */
              email: c.PgEmail_address;
                /**
              * **test_custom.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_custom_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_custom.score**
              * - \`positive_integer\` (base type: \`int4\`) in database
              * - Nullable, no default
              */
              score: c.PgPositive_integer | null;
              };
              Whereable: {
                /**
              * **test_custom.email**
              * - \`email_address\` (base type: \`text\`) in database
              * - \`NOT NULL\`, no default
              */
              email?: c.PgEmail_address | db.Parameter<c.PgEmail_address> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, c.PgEmail_address | db.Parameter<c.PgEmail_address> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_custom.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_custom_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_custom.score**
              * - \`positive_integer\` (base type: \`int4\`) in database
              * - Nullable, no default
              */
              score?: c.PgPositive_integer | db.Parameter<c.PgPositive_integer> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, c.PgPositive_integer | db.Parameter<c.PgPositive_integer> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test_custom.email**
              * - \`email_address\` (base type: \`text\`) in database
              * - \`NOT NULL\`, no default
              */
              email: c.PgEmail_address | db.Parameter<c.PgEmail_address> | db.SQLFragment;
                /**
              * **test_custom.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_custom_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test_custom.score**
              * - \`positive_integer\` (base type: \`int4\`) in database
              * - Nullable, no default
              */
              score?: c.PgPositive_integer | db.Parameter<c.PgPositive_integer> | null | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test_custom.email**
              * - \`email_address\` (base type: \`text\`) in database
              * - \`NOT NULL\`, no default
              */
              email?: c.PgEmail_address | db.Parameter<c.PgEmail_address> | db.SQLFragment | db.SQLFragment<any, c.PgEmail_address | db.Parameter<c.PgEmail_address> | db.SQLFragment>;
                /**
              * **test_custom.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_custom_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_custom.score**
              * - \`positive_integer\` (base type: \`int4\`) in database
              * - Nullable, no default
              */
              score?: c.PgPositive_integer | db.Parameter<c.PgPositive_integer> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, c.PgPositive_integer | db.Parameter<c.PgPositive_integer> | null | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'test_custom_pkey';
              Column: email | id | score;
              SQL: test_customSQLExpression;
            };
            'test_generated': {
              Table: 'test_generated';
              Selectable: {
                /**
              * **test_generated.first_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              first_name: string;
                /**
              * **test_generated.full_name**
              * - \`text\` in database
              * - Generated column
              */
              full_name: string | null;
                /**
              * **test_generated.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_generated_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_generated.last_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              last_name: string;
              };
              JSONSelectable: {
                /**
              * **test_generated.first_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              first_name: string;
                /**
              * **test_generated.full_name**
              * - \`text\` in database
              * - Generated column
              */
              full_name: string | null;
                /**
              * **test_generated.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_generated_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_generated.last_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              last_name: string;
              };
              Whereable: {
                /**
              * **test_generated.first_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              first_name?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_generated.full_name**
              * - \`text\` in database
              * - Generated column
              */
              full_name?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_generated.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_generated_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_generated.last_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              last_name?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test_generated.first_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              first_name: string | db.Parameter<string> | db.SQLFragment;
                /**
              * **test_generated.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_generated_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test_generated.last_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              last_name: string | db.Parameter<string> | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test_generated.first_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              first_name?: string | db.Parameter<string> | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment>;
                /**
              * **test_generated.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_generated_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_generated.last_name**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              last_name?: string | db.Parameter<string> | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment>;
              };
              UniqueIndex: 'test_generated_pkey';
              Column: first_name | full_name | id | last_name;
              SQL: test_generatedSQLExpression;
            };
            'test_json': {
              Table: 'test_json';
              Selectable: {
                /**
              * **test_json.config**
              * - \`jsonb\` in database
              * - \`NOT NULL\`, default: \`'{}'::jsonb\`
              */
              config: db.JSONValue;
                /**
              * **test_json.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_json_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_json.metadata**
              * - \`json\` in database
              * - \`NOT NULL\`, no default
              */
              metadata: db.JSONValue;
                /**
              * **test_json.settings**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              settings: db.JSONValue | null;
              };
              JSONSelectable: {
                /**
              * **test_json.config**
              * - \`jsonb\` in database
              * - \`NOT NULL\`, default: \`'{}'::jsonb\`
              */
              config: db.JSONValue;
                /**
              * **test_json.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_json_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_json.metadata**
              * - \`json\` in database
              * - \`NOT NULL\`, no default
              */
              metadata: db.JSONValue;
                /**
              * **test_json.settings**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              settings: db.JSONValue | null;
              };
              Whereable: {
                /**
              * **test_json.config**
              * - \`jsonb\` in database
              * - \`NOT NULL\`, default: \`'{}'::jsonb\`
              */
              config?: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_json.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_json_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_json.metadata**
              * - \`json\` in database
              * - \`NOT NULL\`, no default
              */
              metadata?: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_json.settings**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              settings?: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test_json.config**
              * - \`jsonb\` in database
              * - \`NOT NULL\`, default: \`'{}'::jsonb\`
              */
              config?: db.JSONValue | db.Parameter<db.JSONValue> | db.DefaultType | db.SQLFragment;
                /**
              * **test_json.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_json_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test_json.metadata**
              * - \`json\` in database
              * - \`NOT NULL\`, no default
              */
              metadata: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment;
                /**
              * **test_json.settings**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              settings?: db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test_json.config**
              * - \`jsonb\` in database
              * - \`NOT NULL\`, default: \`'{}'::jsonb\`
              */
              config?: db.JSONValue | db.Parameter<db.JSONValue> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_json.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_json_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_json.metadata**
              * - \`json\` in database
              * - \`NOT NULL\`, no default
              */
              metadata?: db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | db.SQLFragment>;
                /**
              * **test_json.settings**
              * - \`jsonb\` in database
              * - Nullable, no default
              */
              settings?: db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, db.JSONValue | db.Parameter<db.JSONValue> | null | db.DefaultType | db.SQLFragment>;
              };
              UniqueIndex: 'test_json_pkey';
              Column: config | id | metadata | settings;
              SQL: test_jsonSQLExpression;
            };
            'test_nullability': {
              Table: 'test_nullability';
              Selectable: {
                /**
              * **test_nullability.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_nullability_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_nullability.optional_field**
              * - \`text\` in database
              * - Nullable, no default
              */
              optional_field: string | null;
                /**
              * **test_nullability.optional_number**
              * - \`int4\` in database
              * - Nullable, no default
              */
              optional_number: number | null;
                /**
              * **test_nullability.required_field**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              required_field: string;
                /**
              * **test_nullability.required_number**
              * - \`int4\` in database
              * - \`NOT NULL\`, no default
              */
              required_number: number;
              };
              JSONSelectable: {
                /**
              * **test_nullability.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_nullability_id_seq'::regclass)\`
              */
              id: number;
                /**
              * **test_nullability.optional_field**
              * - \`text\` in database
              * - Nullable, no default
              */
              optional_field: string | null;
                /**
              * **test_nullability.optional_number**
              * - \`int4\` in database
              * - Nullable, no default
              */
              optional_number: number | null;
                /**
              * **test_nullability.required_field**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              required_field: string;
                /**
              * **test_nullability.required_number**
              * - \`int4\` in database
              * - \`NOT NULL\`, no default
              */
              required_number: number;
              };
              Whereable: {
                /**
              * **test_nullability.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_nullability_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_nullability.optional_field**
              * - \`text\` in database
              * - Nullable, no default
              */
              optional_field?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_nullability.optional_number**
              * - \`int4\` in database
              * - Nullable, no default
              */
              optional_number?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_nullability.required_field**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              required_field?: string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment | db.ParentColumn<any>>;
                /**
              * **test_nullability.required_number**
              * - \`int4\` in database
              * - \`NOT NULL\`, no default
              */
              required_number?: number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any> | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment | db.ParentColumn<any>>;
              };
              Insertable: {
                /**
              * **test_nullability.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_nullability_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment;
                /**
              * **test_nullability.optional_field**
              * - \`text\` in database
              * - Nullable, no default
              */
              optional_field?: string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment;
                /**
              * **test_nullability.optional_number**
              * - \`int4\` in database
              * - Nullable, no default
              */
              optional_number?: number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment;
                /**
              * **test_nullability.required_field**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              required_field: string | db.Parameter<string> | db.SQLFragment;
                /**
              * **test_nullability.required_number**
              * - \`int4\` in database
              * - \`NOT NULL\`, no default
              */
              required_number: number | db.Parameter<number> | db.SQLFragment;
              };
              Updatable: {
                /**
              * **test_nullability.id**
              * - \`int4\` in database
              * - \`NOT NULL\`, default: \`nextval('test_nullability_id_seq'::regclass)\`
              */
              id?: number | db.Parameter<number> | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.DefaultType | db.SQLFragment>;
                /**
              * **test_nullability.optional_field**
              * - \`text\` in database
              * - Nullable, no default
              */
              optional_field?: string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **test_nullability.optional_number**
              * - \`int4\` in database
              * - Nullable, no default
              */
              optional_number?: number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | null | db.DefaultType | db.SQLFragment>;
                /**
              * **test_nullability.required_field**
              * - \`text\` in database
              * - \`NOT NULL\`, no default
              */
              required_field?: string | db.Parameter<string> | db.SQLFragment | db.SQLFragment<any, string | db.Parameter<string> | db.SQLFragment>;
                /**
              * **test_nullability.required_number**
              * - \`int4\` in database
              * - \`NOT NULL\`, no default
              */
              required_number?: number | db.Parameter<number> | db.SQLFragment | db.SQLFragment<any, number | db.Parameter<number> | db.SQLFragment>;
              };
              UniqueIndex: 'test_nullability_pkey';
              Column: id | optional_field | optional_number | required_field | required_number;
              SQL: test_nullabilitySQLExpression;
            };
          }

          /* --- Backward compatible namespace aliases --- */

          /**
           * **another_included**
           * - Table in database
           */
          export namespace another_included {
            export type Table = StructureMap['another_included']['Table'];
            export type Selectable = StructureMap['another_included']['Selectable'];
            export type JSONSelectable = StructureMap['another_included']['JSONSelectable'];
            export type Whereable = StructureMap['another_included']['Whereable'];
            export type Insertable = StructureMap['another_included']['Insertable'];
            export type Updatable = StructureMap['another_included']['Updatable'];
            export type UniqueIndex = StructureMap['another_included']['UniqueIndex'];
            export type Column = StructureMap['another_included']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **comprehensive**
           * - Table in database
           */
          export namespace comprehensive {
            export type Table = StructureMap['comprehensive']['Table'];
            export type Selectable = StructureMap['comprehensive']['Selectable'];
            export type JSONSelectable = StructureMap['comprehensive']['JSONSelectable'];
            export type Whereable = StructureMap['comprehensive']['Whereable'];
            export type Insertable = StructureMap['comprehensive']['Insertable'];
            export type Updatable = StructureMap['comprehensive']['Updatable'];
            export type UniqueIndex = StructureMap['comprehensive']['UniqueIndex'];
            export type Column = StructureMap['comprehensive']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **excluded_table**
           * - Table in database
           */
          export namespace excluded_table {
            export type Table = StructureMap['excluded_table']['Table'];
            export type Selectable = StructureMap['excluded_table']['Selectable'];
            export type JSONSelectable = StructureMap['excluded_table']['JSONSelectable'];
            export type Whereable = StructureMap['excluded_table']['Whereable'];
            export type Insertable = StructureMap['excluded_table']['Insertable'];
            export type Updatable = StructureMap['excluded_table']['Updatable'];
            export type UniqueIndex = StructureMap['excluded_table']['UniqueIndex'];
            export type Column = StructureMap['excluded_table']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **included_table**
           * - Table in database
           */
          export namespace included_table {
            export type Table = StructureMap['included_table']['Table'];
            export type Selectable = StructureMap['included_table']['Selectable'];
            export type JSONSelectable = StructureMap['included_table']['JSONSelectable'];
            export type Whereable = StructureMap['included_table']['Whereable'];
            export type Insertable = StructureMap['included_table']['Insertable'];
            export type Updatable = StructureMap['included_table']['Updatable'];
            export type UniqueIndex = StructureMap['included_table']['UniqueIndex'];
            export type Column = StructureMap['included_table']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **products**
           * - Table in database
           */
          export namespace products {
            export type Table = StructureMap['products']['Table'];
            export type Selectable = StructureMap['products']['Selectable'];
            export type JSONSelectable = StructureMap['products']['JSONSelectable'];
            export type Whereable = StructureMap['products']['Whereable'];
            export type Insertable = StructureMap['products']['Insertable'];
            export type Updatable = StructureMap['products']['Updatable'];
            export type UniqueIndex = StructureMap['products']['UniqueIndex'];
            export type Column = StructureMap['products']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **some_table**
           * - Table in database
           */
          export namespace some_table {
            export type Table = StructureMap['some_table']['Table'];
            export type Selectable = StructureMap['some_table']['Selectable'];
            export type JSONSelectable = StructureMap['some_table']['JSONSelectable'];
            export type Whereable = StructureMap['some_table']['Whereable'];
            export type Insertable = StructureMap['some_table']['Insertable'];
            export type Updatable = StructureMap['some_table']['Updatable'];
            export type UniqueIndex = StructureMap['some_table']['UniqueIndex'];
            export type Column = StructureMap['some_table']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test**
           * - Table in database
           */
          export namespace test {
            export type Table = StructureMap['test']['Table'];
            export type Selectable = StructureMap['test']['Selectable'];
            export type JSONSelectable = StructureMap['test']['JSONSelectable'];
            export type Whereable = StructureMap['test']['Whereable'];
            export type Insertable = StructureMap['test']['Insertable'];
            export type Updatable = StructureMap['test']['Updatable'];
            export type UniqueIndex = StructureMap['test']['UniqueIndex'];
            export type Column = StructureMap['test']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test_arrays**
           * - Table in database
           */
          export namespace test_arrays {
            export type Table = StructureMap['test_arrays']['Table'];
            export type Selectable = StructureMap['test_arrays']['Selectable'];
            export type JSONSelectable = StructureMap['test_arrays']['JSONSelectable'];
            export type Whereable = StructureMap['test_arrays']['Whereable'];
            export type Insertable = StructureMap['test_arrays']['Insertable'];
            export type Updatable = StructureMap['test_arrays']['Updatable'];
            export type UniqueIndex = StructureMap['test_arrays']['UniqueIndex'];
            export type Column = StructureMap['test_arrays']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test_custom**
           * - Table in database
           */
          export namespace test_custom {
            export type Table = StructureMap['test_custom']['Table'];
            export type Selectable = StructureMap['test_custom']['Selectable'];
            export type JSONSelectable = StructureMap['test_custom']['JSONSelectable'];
            export type Whereable = StructureMap['test_custom']['Whereable'];
            export type Insertable = StructureMap['test_custom']['Insertable'];
            export type Updatable = StructureMap['test_custom']['Updatable'];
            export type UniqueIndex = StructureMap['test_custom']['UniqueIndex'];
            export type Column = StructureMap['test_custom']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test_generated**
           * - Table in database
           */
          export namespace test_generated {
            export type Table = StructureMap['test_generated']['Table'];
            export type Selectable = StructureMap['test_generated']['Selectable'];
            export type JSONSelectable = StructureMap['test_generated']['JSONSelectable'];
            export type Whereable = StructureMap['test_generated']['Whereable'];
            export type Insertable = StructureMap['test_generated']['Insertable'];
            export type Updatable = StructureMap['test_generated']['Updatable'];
            export type UniqueIndex = StructureMap['test_generated']['UniqueIndex'];
            export type Column = StructureMap['test_generated']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test_json**
           * - Table in database
           */
          export namespace test_json {
            export type Table = StructureMap['test_json']['Table'];
            export type Selectable = StructureMap['test_json']['Selectable'];
            export type JSONSelectable = StructureMap['test_json']['JSONSelectable'];
            export type Whereable = StructureMap['test_json']['Whereable'];
            export type Insertable = StructureMap['test_json']['Insertable'];
            export type Updatable = StructureMap['test_json']['Updatable'];
            export type UniqueIndex = StructureMap['test_json']['UniqueIndex'];
            export type Column = StructureMap['test_json']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }


          /**
           * **test_nullability**
           * - Table in database
           */
          export namespace test_nullability {
            export type Table = StructureMap['test_nullability']['Table'];
            export type Selectable = StructureMap['test_nullability']['Selectable'];
            export type JSONSelectable = StructureMap['test_nullability']['JSONSelectable'];
            export type Whereable = StructureMap['test_nullability']['Whereable'];
            export type Insertable = StructureMap['test_nullability']['Insertable'];
            export type Updatable = StructureMap['test_nullability']['Updatable'];
            export type UniqueIndex = StructureMap['test_nullability']['UniqueIndex'];
            export type Column = StructureMap['test_nullability']['Column'];
            export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
            export type SQLExpression = Table | ColumnNames<Updatable | (keyof Updatable)[]> | ColumnValues<Updatable> | Whereable | Column | ParentColumn | GenericSQLExpression;
            export type SQL = SQLExpression | SQLExpression[];
          }
        }
        "
      `);
    }, 60000);
  });
});
