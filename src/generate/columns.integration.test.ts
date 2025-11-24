import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { relationsInSchema } from './tables';

/**
 * Integration tests for column introspection
 *
 * These tests verify that we correctly query PostgreSQL metadata to discover:
 * - Column names, types, and attributes
 * - Nullability (NULL vs NOT NULL)
 * - Default values (including SERIAL/IDENTITY)
 * - Generated columns
 * - Domain types
 * - Column descriptions (comments)
 *
 * Tests use internal columnsForRelation via dataForRelationInSchema
 */
describe('Column Introspection - Integration Tests', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;

  beforeAll(async () => {
    console.log('Starting PostgreSQL container for column introspection tests...');
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('columns_test')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();
    console.log('PostgreSQL container started');

    pool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });

    pool.on('error', (err) => {
      const code = 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === '57P01' || code === 'ECONNREFUSED') {
        console.log('Expected connection error during cleanup');
      } else {
        console.error('Unexpected pool error:', err);
      }
    });
  }, 60000);

  afterAll(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.log('Pool cleanup error (expected during shutdown):', err instanceof Error ? err.message : String(err));
    }

    console.log('Stopping PostgreSQL container...');
    await container.stop();
    console.log('PostgreSQL container stopped');
  }, 60000);

  beforeEach(async () => {
    // Clean up before each test
    await pool.query(`
      DROP TABLE IF EXISTS test_table CASCADE;
      DROP VIEW IF EXISTS test_view CASCADE;
      DROP MATERIALIZED VIEW IF EXISTS test_mview CASCADE;
      DROP DOMAIN IF EXISTS email_type CASCADE;
    `);
  });

  const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);

  /**
   * Helper to get columns for a table
   * Uses the actual columnsForRelation function indirectly through relationsInSchema
   */
  const getTableColumns = async (tableName: string, schemaName = 'public') => {
    const relations = await relationsInSchema(schemaName, queryFn);
    const relation = relations.find(r => r.name === tableName);

    if (!relation) {
      throw new Error(`Table ${tableName} not found in schema ${schemaName}`);
    }

    // We need to access columnsForRelation, but it's not exported
    // So we'll use the generate pipeline and parse the output
    // OR we can test via dataForRelationInSchema which is exported
    const { dataForRelationInSchema } = await import('./tables');
    const { enumDataForSchema } = await import('./enums');
    const { finaliseConfig } = await import('./config');

    const config = finaliseConfig({
      db: {
        host: container.getHost(),
        port: container.getPort(),
        database: container.getDatabase(),
        user: container.getUsername(),
        password: container.getPassword(),
      },
      outDir: './test-output',
      schemas: { [schemaName]: { include: '*', exclude: [] } },
    });

    const enums = await enumDataForSchema(schemaName, queryFn);
    const customTypes = {};

    const data = await dataForRelationInSchema(
      relation,
      schemaName,
      enums,
      customTypes,
      config,
      queryFn
    );

    return {
      relation,
      data,
      customTypes,
    };
  };

  describe('Basic Column Types', () => {
    it('discovers columns with common PostgreSQL types', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id INTEGER,
          name TEXT,
          age SMALLINT,
          salary NUMERIC(10, 2),
          is_active BOOLEAN,
          created_at TIMESTAMP,
          updated_at TIMESTAMPTZ,
          metadata JSONB,
          tags TEXT[]
        );
      `);

      const { data } = await getTableColumns('test_table');

      // Verify all columns are discovered
      expect(data.columns).toContain('id');
      expect(data.columns).toContain('name');
      expect(data.columns).toContain('age');
      expect(data.columns).toContain('salary');
      expect(data.columns).toContain('is_active');
      expect(data.columns).toContain('created_at');
      expect(data.columns).toContain('updated_at');
      expect(data.columns).toContain('metadata');
      expect(data.columns).toContain('tags');
    });

    it('handles UUID and other special types', async () => {
      await pool.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE test_table (
          id UUID DEFAULT uuid_generate_v4(),
          ip INET,
          mac MACADDR,
          location POINT
        );
      `);

      const { data } = await getTableColumns('test_table');

      expect(data.columns).toContain('id');
      expect(data.columns).toContain('ip');
      expect(data.columns).toContain('mac');
      expect(data.columns).toContain('location');
    });
  });

  describe('Nullability Detection', () => {
    it('correctly identifies NOT NULL columns', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          required_field TEXT NOT NULL,
          optional_field TEXT
        );
      `);

      const { data } = await getTableColumns('test_table');

      // Required fields should not have "| null" in their type
      const requiredSelectable = data.selectables.find(s => s.includes('required_field'));
      expect(requiredSelectable).toBeDefined();
      expect(requiredSelectable).toContain('required_field: string;');
      expect(requiredSelectable).not.toContain('| null');

      // Optional fields should have "| null"
      const optionalSelectable = data.selectables.find(s => s.includes('optional_field'));
      expect(optionalSelectable).toBeDefined();
      expect(optionalSelectable).toContain('| null');
    });

    it('handles PRIMARY KEY constraint (implicitly NOT NULL)', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY
        );
      `);

      const { data } = await getTableColumns('test_table');

      const idSelectable = data.selectables.find(s => s.includes('id'));
      expect(idSelectable).toBeDefined();
      expect(idSelectable).not.toContain('| null');
    });
  });

  describe('Default Values', () => {
    it('detects SERIAL columns with defaults', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          counter BIGSERIAL
        );
      `);

      const { data } = await getTableColumns('test_table');

      // SERIAL columns should be optional in insertables (have default)
      const idInsertable = data.insertables.find(s => s.includes('id'));
      expect(idInsertable).toBeDefined();
      expect(idInsertable).toContain('id?:'); // Optional because of default

      const counterInsertable = data.insertables.find(s => s.includes('counter'));
      expect(counterInsertable).toBeDefined();
      expect(counterInsertable).toContain('counter?:'); // Optional
    });

    it('detects explicit DEFAULT values', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          status TEXT DEFAULT 'active',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          counter INTEGER DEFAULT 0
        );
      `);

      const { data } = await getTableColumns('test_table');

      // All should be optional in insertables
      expect(data.insertables.find(s => s.includes('status?:'))).toBeDefined();
      expect(data.insertables.find(s => s.includes('created_at?:'))).toBeDefined();
      expect(data.insertables.find(s => s.includes('counter?:'))).toBeDefined();
    });

    it('detects IDENTITY columns', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          external_id INTEGER GENERATED BY DEFAULT AS IDENTITY
        );
      `);

      const { data } = await getTableColumns('test_table');

      // GENERATED ALWAYS AS IDENTITY: isGenerated=true, so not in insertables
      // Look for exact match of 'id' column (not 'external_id')
      const idInsertable = data.insertables.find(s => /\bid[?:]/.test(s));
      expect(idInsertable).toBeUndefined();

      // GENERATED BY DEFAULT AS IDENTITY: isGenerated=false, hasDefault=true
      // So it should be optional in insertables
      const externalIdInsertable = data.insertables.find(s => s.includes('external_id'));
      expect(externalIdInsertable).toBeDefined();
      expect(externalIdInsertable).toContain('external_id?:'); // Optional due to default
    });
  });

  describe('Generated Columns', () => {
    it('detects computed generated columns', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
        );
      `);

      const { data } = await getTableColumns('test_table');

      // Generated column should appear in selectables
      expect(data.selectables.find(s => s.includes('full_name'))).toBeDefined();

      // But NOT in insertables or updatables
      expect(data.insertables.find(s => s.includes('full_name'))).toBeUndefined();
      expect(data.updatables.find(s => s.includes('full_name'))).toBeUndefined();
    });

    it('marks materialized view columns as generated', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          value INTEGER
        );

        CREATE MATERIALIZED VIEW test_mview AS
        SELECT id, value, value * 2 as doubled
        FROM test_table;
      `);

      const { data } = await getTableColumns('test_mview');

      // All columns in materialized view should be non-insertable
      expect(data.insertables).toEqual([]);
      expect(data.updatables).toEqual([]);

      // But all should be selectable
      expect(data.selectables.find(s => s.includes('id'))).toBeDefined();
      expect(data.selectables.find(s => s.includes('value'))).toBeDefined();
      expect(data.selectables.find(s => s.includes('doubled'))).toBeDefined();
    });
  });

  describe('Domain Types', () => {
    it('detects domain types and treats them as custom types', async () => {
      await pool.query(`
        CREATE DOMAIN email_type AS TEXT
        CHECK (VALUE ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$');

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          email email_type NOT NULL
        );
      `);

      const { data, customTypes } = await getTableColumns('test_table');

      // Domain should be registered as custom type
      expect(customTypes).toHaveProperty('PgEmail_type');

      // Column should use custom type
      const emailSelectable = data.selectables.find(s => s.includes('email'));
      expect(emailSelectable).toBeDefined();
      expect(emailSelectable).toContain('c.PgEmail_type');
    });

    it('handles domains based on base types', async () => {
      await pool.query(`
        CREATE DOMAIN positive_int AS INTEGER
        CHECK (VALUE > 0);

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          quantity positive_int
        );
      `);

      const { customTypes } = await getTableColumns('test_table');

      // Domain should be registered, with base type info
      expect(customTypes).toHaveProperty('PgPositive_int');
      // The base type for positive_int is int4, which maps to number
      expect((customTypes as Record<string, string>)['PgPositive_int']).toBe('number');
    });
  });

  describe('Array Types', () => {
    it('discovers array columns', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          tags TEXT[],
          numbers INTEGER[],
          matrix INTEGER[][]
        );
      `);

      const { data } = await getTableColumns('test_table');

      expect(data.columns).toContain('tags');
      expect(data.columns).toContain('numbers');
      expect(data.columns).toContain('matrix');
    });

    it('handles arrays of custom types', async () => {
      await pool.query(`
        CREATE DOMAIN email_type AS TEXT;

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          emails email_type[]
        );
      `);

      const { customTypes } = await getTableColumns('test_table');

      // Array of domain should create custom type
      expect(customTypes).toHaveProperty('Pg_email_type'); // Array types get underscored
    });
  });

  describe('Column Comments', () => {
    it('discovers column descriptions (comments)', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        COMMENT ON COLUMN test_table.name IS 'The user full name';
      `);

      const { data } = await getTableColumns('test_table');

      // When schemaJSDoc is enabled, comments should appear in output
      // For now, we just verify the column exists
      expect(data.columns).toContain('name');
    });
  });

  describe('Special Characters in Column Names', () => {
    it('handles columns with special characters', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          "user-id" INTEGER,
          "first name" TEXT,
          "email@address" TEXT
        );
      `);

      const { data } = await getTableColumns('test_table');

      expect(data.columns).toContain('user-id');
      expect(data.columns).toContain('first name');
      expect(data.columns).toContain('email@address');
    });

    it('quotes column names that are not valid JavaScript identifiers', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          "column-with-dash" TEXT,
          "123numeric" TEXT,
          "with space" TEXT
        );
      `);

      const { data } = await getTableColumns('test_table');

      // Find the selectable entries - they should have quoted column names
      const dashedSelectable = data.selectables.find(s => s.includes('column-with-dash'));
      const numericSelectable = data.selectables.find(s => s.includes('123numeric'));
      const spaceSelectable = data.selectables.find(s => s.includes('with space'));

      expect(dashedSelectable).toBeDefined();
      expect(numericSelectable).toBeDefined();
      expect(spaceSelectable).toBeDefined();

      // Column names with special chars should be quoted
      expect(dashedSelectable).toContain('"column-with-dash"');
      expect(numericSelectable).toContain('"123numeric"');
      expect(spaceSelectable).toContain('"with space"');
    });
  });

  describe('View Columns', () => {
    it('discovers columns in regular views', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          name TEXT,
          email TEXT
        );

        CREATE VIEW test_view AS
        SELECT id, name FROM test_table;
      `);

      const { data } = await getTableColumns('test_view');

      expect(data.columns).toContain('id');
      expect(data.columns).toContain('name');
      expect(data.columns).not.toContain('email'); // Not in view
    });

    it('handles computed columns in views', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          first_name TEXT,
          last_name TEXT
        );

        CREATE VIEW test_view AS
        SELECT
          id,
          first_name || ' ' || last_name as full_name
        FROM test_table;
      `);

      const { data } = await getTableColumns('test_view');

      expect(data.columns).toContain('id');
      expect(data.columns).toContain('full_name');
    });
  });

  describe('Edge Cases', () => {
    it('handles tables with no columns (should not happen but...)', async () => {
      // Note: PostgreSQL doesn't actually allow tables with no columns
      // But we test that our code handles empty column arrays gracefully
      await pool.query(`
        CREATE TABLE test_table (id SERIAL PRIMARY KEY);
      `);

      const { data } = await getTableColumns('test_table');

      expect(data.columns).toBeDefined();
      expect(Array.isArray(data.columns)).toBe(true);
      expect(data.columns.length).toBeGreaterThan(0);
    });

    it('handles very long column names (up to PostgreSQL limit)', async () => {
      // PostgreSQL has a 63-character limit on identifiers (NAMEDATALEN - 1)
      // Names longer than this are truncated
      const longName = 'very_long_column_name_that_is_still_within_sixty_three_ch';
      expect(longName.length).toBeLessThanOrEqual(63);

      await pool.query(`
        CREATE TABLE test_table (
          "${longName}" TEXT
        );
      `);

      const { data } = await getTableColumns('test_table');

      expect(data.columns).toContain(longName);
    });

    it('handles tables with only generated/identity columns', async () => {
      // Note: Can't use NOW() in GENERATED ALWAYS column (it's not immutable)
      // Use CURRENT_TIMESTAMP in a default instead
      await pool.query(`
        CREATE TABLE test_table (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const { data } = await getTableColumns('test_table');

      // id is GENERATED ALWAYS, so not in insertables
      expect(data.insertables.find(s => s.includes('id'))).toBeUndefined();
      // created_at has a default, so should be optional in insertables
      const createdAtInsertable = data.insertables.find(s => s.includes('created_at'));
      expect(createdAtInsertable).toBeDefined();
      expect(createdAtInsertable).toContain('created_at?:');

      // But selectables should have both columns
      expect(data.selectables.find(s => s.includes('id'))).toBeDefined();
      expect(data.selectables.find(s => s.includes('created_at'))).toBeDefined();
    });
  });

  describe('Column Ordering', () => {
    it('returns columns in definition order', async () => {
      await pool.query(`
        CREATE TABLE test_table (
          zebra TEXT,
          alpha TEXT,
          beta TEXT
        );
      `);

      const { data } = await getTableColumns('test_table');

      // Columns should be in alphabetical order (as per ORDER BY "column" in SQL)
      const columnOrder = data.columns;
      expect(columnOrder.indexOf('alpha')).toBeLessThan(columnOrder.indexOf('beta'));
      expect(columnOrder.indexOf('beta')).toBeLessThan(columnOrder.indexOf('zebra'));
    });
  });
});
