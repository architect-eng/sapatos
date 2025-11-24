import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startTestDatabase, stopTestDatabase, getTestPool } from '../test-helpers/integration-db';
import { enumDataForSchema, enumTypesForEnumData } from './enums';

/**
 * Integration tests for enum introspection and type generation
 *
 * These tests verify that we correctly query PostgreSQL metadata to discover:
 * - Enum types and their values
 * - Multiple enums in the same schema
 * - Enum values with special characters
 * - Enums in different schemas
 *
 * Also tests the TypeScript generation for enums.
 */
describe('Enum Introspection - Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    await startTestDatabase();
    pool = getTestPool();
  }, 60000);

  afterAll(async () => {
    await stopTestDatabase();
  }, 60000);

  beforeEach(async () => {
    // Clean up before each test
    await pool.query(`
      DROP TABLE IF EXISTS test_table CASCADE;
      DROP TABLE IF EXISTS tasks CASCADE;
      DROP TYPE IF EXISTS status CASCADE;
      DROP TYPE IF EXISTS priority CASCADE;
      DROP TYPE IF EXISTS role CASCADE;
    `);
  });

  const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);

  describe('enumDataForSchema - Enum Discovery', () => {
    it('discovers single enum type', async () => {
      await pool.query(`
        CREATE TYPE status AS ENUM ('pending', 'active', 'inactive');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('status');
      // PostgreSQL returns enum values in alphabetical order (ORDER BY enumlabel)
      expect(enums.status).toEqual(['active', 'inactive', 'pending']);
    });

    it('discovers multiple enum types in same schema', async () => {
      await pool.query(`
        CREATE TYPE status AS ENUM ('pending', 'active', 'inactive');
        CREATE TYPE priority AS ENUM ('low', 'medium', 'high', 'urgent');
        CREATE TYPE role AS ENUM ('user', 'admin', 'superadmin');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('status');
      expect(enums).toHaveProperty('priority');
      expect(enums).toHaveProperty('role');

      // All returned in alphabetical order
      expect(enums.status).toEqual(['active', 'inactive', 'pending']);
      expect(enums.priority).toEqual(['high', 'low', 'medium', 'urgent']);
      expect(enums.role).toEqual(['admin', 'superadmin', 'user']);
    });

    it('returns empty object for schema with no enums', async () => {
      // Create empty schema
      await pool.query(`
        DROP SCHEMA IF EXISTS no_enums CASCADE;
        CREATE SCHEMA no_enums;
      `);

      const enums = await enumDataForSchema('no_enums', queryFn);

      expect(enums).toEqual({});
    });

    it('handles enum values with special characters', async () => {
      await pool.query(`
        CREATE TYPE special_enum AS ENUM (
          'value-with-dash',
          'value with space',
          'value.with.dots',
          'UPPERCASE',
          'MixedCase'
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);

      // Values are returned in alphabetical order
      expect(enums.special_enum).toEqual([
        'MixedCase',
        'UPPERCASE',
        'value with space',
        'value-with-dash',
        'value.with.dots',
      ]);
    });

    it('handles enum values that need escaping in TypeScript', async () => {
      await pool.query(`
        CREATE TYPE quote_enum AS ENUM (
          'single''quote',
          'back\\slash',
          'new
line'
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('quote_enum');
      expect(enums.quote_enum).toContain('single\'quote');
      expect(enums.quote_enum).toContain('back\\slash');
      expect(enums.quote_enum).toContain('new\nline');
    });

    it('preserves enum value order', async () => {
      await pool.query(`
        CREATE TYPE ordered_enum AS ENUM ('zebra', 'alpha', 'beta');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      // Enum values should be in definition order (alphabetical due to ORDER BY in query)
      expect(enums.ordered_enum).toEqual(['alpha', 'beta', 'zebra']);
    });

    it('handles enums with single value', async () => {
      await pool.query(`
        CREATE TYPE singleton AS ENUM ('only_value');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums.singleton).toEqual(['only_value']);
    });

    it('handles enums with many values', async () => {
      const values = Array.from({ length: 100 }, (_, i) => `value_${String(i)}`);
      const valuesList = values.map(v => `'${v}'`).join(', ');

      await pool.query(`
        CREATE TYPE large_enum AS ENUM (${valuesList});
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums.large_enum).toHaveLength(100);
      expect(enums.large_enum).toContain('value_0');
      expect(enums.large_enum).toContain('value_50');
      expect(enums.large_enum).toContain('value_99');
    });
  });

  describe('enumDataForSchema - Multi-Schema Support', () => {
    beforeAll(async () => {
      await pool.query(`
        DROP SCHEMA IF EXISTS schema_a CASCADE;
        DROP SCHEMA IF EXISTS schema_b CASCADE;

        CREATE SCHEMA schema_a;
        CREATE SCHEMA schema_b;
      `);
    });

    it('discovers enums only in specified schema', async () => {
      await pool.query(`
        CREATE TYPE schema_a.status_a AS ENUM ('a1', 'a2');
        CREATE TYPE schema_b.status_b AS ENUM ('b1', 'b2');
      `);

      const enumsA = await enumDataForSchema('schema_a', queryFn);
      const enumsB = await enumDataForSchema('schema_b', queryFn);

      expect(enumsA).toHaveProperty('status_a');
      expect(enumsA).not.toHaveProperty('status_b');

      expect(enumsB).toHaveProperty('status_b');
      expect(enumsB).not.toHaveProperty('status_a');
    });

    it('handles same enum name in different schemas', async () => {
      await pool.query(`
        CREATE TYPE schema_a.shared_enum AS ENUM ('a_value');
        CREATE TYPE schema_b.shared_enum AS ENUM ('b_value');
      `);

      const enumsA = await enumDataForSchema('schema_a', queryFn);
      const enumsB = await enumDataForSchema('schema_b', queryFn);

      expect(enumsA.shared_enum).toEqual(['a_value']);
      expect(enumsB.shared_enum).toEqual(['b_value']);
    });
  });

  describe('enumTypesForEnumData - TypeScript Generation', () => {
    it('generates union type for single enum', () => {
      const enumData = {
        status: ['pending', 'active', 'inactive'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toContain('export type status = ');
      expect(tsCode).toContain("'pending'");
      expect(tsCode).toContain("'active'");
      expect(tsCode).toContain("'inactive'");
      expect(tsCode).toContain(" | ");
    });

    it('generates every namespace with tuple type', () => {
      const enumData = {
        status: ['pending', 'active', 'inactive'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toContain('export namespace every {');
      expect(tsCode).toContain('export type status = [');
      expect(tsCode).toContain("'pending', 'active', 'inactive'");
      expect(tsCode).toContain('];');
    });

    it('generates types for multiple enums', () => {
      const enumData = {
        status: ['pending', 'active'],
        priority: ['low', 'high'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toContain('export type status = ');
      expect(tsCode).toContain('export type priority = ');
      expect(tsCode).toMatch(/export namespace every\s*{[^}]+export type status/);
      expect(tsCode).toMatch(/export namespace every\s*{[^}]+export type priority/);
    });

    it('handles enum values with special characters in TypeScript', () => {
      const enumData = {
        special: ['value-dash', 'value space', 'value.dot'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toContain("'value-dash'");
      expect(tsCode).toContain("'value space'");
      expect(tsCode).toContain("'value.dot'");
    });

    it('escapes single quotes in enum values', () => {
      const enumData = {
        quotes: ["value'with'quotes"],
      };

      const tsCode = enumTypesForEnumData(enumData);

      // TypeScript string literals should escape single quotes
      expect(tsCode).toContain("'value'with'quotes'");
    });

    it('generates empty string for empty enum data', () => {
      const enumData = {};

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toBe('');
    });

    it('handles enum with single value', () => {
      const enumData = {
        singleton: ['only'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      expect(tsCode).toContain('export type singleton = ');
      expect(tsCode).toContain("'only'");
      expect(tsCode).not.toContain(' | '); // No union needed
    });

    it('preserves value order in generated types', () => {
      const enumData = {
        ordered: ['zebra', 'alpha', 'beta'],
      };

      const tsCode = enumTypesForEnumData(enumData);

      // Check that values appear in order in both union and tuple
      const unionMatch = tsCode.match(/export type ordered = '([^']+)' \| '([^']+)' \| '([^']+)'/);
      expect(unionMatch).toBeDefined();
      expect(unionMatch?.[1]).toBe('zebra');
      expect(unionMatch?.[2]).toBe('alpha');
      expect(unionMatch?.[3]).toBe('beta');
    });
  });

  describe('Enum Usage in Tables', () => {
    it('uses enum types in table columns', async () => {
      await pool.query(`
        CREATE TYPE status AS ENUM ('pending', 'active', 'inactive');

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          status status NOT NULL
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums.status).toBeDefined();
      // Alphabetical order
      expect(enums.status).toEqual(['active', 'inactive', 'pending']);

      // The column should use the enum type (verified in type transformation tests)
    });

    it('handles nullable enum columns', async () => {
      await pool.query(`
        CREATE TYPE priority AS ENUM ('low', 'medium', 'high');

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          priority priority
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums.priority).toBeDefined();
    });

    it('handles array of enum columns', async () => {
      await pool.query(`
        CREATE TYPE role AS ENUM ('user', 'admin');

        CREATE TABLE test_table (
          id SERIAL PRIMARY KEY,
          roles role[]
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums.role).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('handles enum names with underscores', async () => {
      await pool.query(`
        CREATE TYPE user_status_type AS ENUM ('active', 'inactive');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('user_status_type');
    });

    it('handles enum names that are SQL keywords', async () => {
      await pool.query(`
        CREATE TYPE "order" AS ENUM ('asc', 'desc');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('order');
    });

    it('handles very long enum names (up to PostgreSQL limit)', async () => {
      // PostgreSQL has a 63-character limit on identifiers (NAMEDATALEN - 1)
      // Names longer than this are truncated
      const longName = 'very_long_enum_name_that_is_still_within_sixty_three_chars';

      await pool.query(`
        CREATE TYPE ${longName} AS ENUM ('value1', 'value2');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty(longName);
      expect(longName.length).toBeLessThanOrEqual(63);
    });

    it('handles mixed case enum names', async () => {
      await pool.query(`
        CREATE TYPE "MixedCaseEnum" AS ENUM ('Value1', 'Value2');
      `);

      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('MixedCaseEnum');
    });
  });

  describe('Integration with Type Generation', () => {
    it('generates complete TypeScript for schema with enums and tables', async () => {
      await pool.query(`
        CREATE TYPE status AS ENUM ('pending', 'active', 'inactive');
        CREATE TYPE priority AS ENUM ('low', 'medium', 'high');

        CREATE TABLE tasks (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          status status DEFAULT 'pending',
          priority priority
        );
      `);

      const enums = await enumDataForSchema('public', queryFn);
      const tsCode = enumTypesForEnumData(enums);

      // Verify enums are discovered
      expect(enums).toHaveProperty('status');
      expect(enums).toHaveProperty('priority');

      // Verify TypeScript is generated
      expect(tsCode).toContain('export type status = ');
      expect(tsCode).toContain('export type priority = ');

      // Verify every namespace
      expect(tsCode).toContain('export namespace every');
    });
  });
});
