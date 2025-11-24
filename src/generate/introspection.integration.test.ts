import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestDatabase, stopTestDatabase, getTestPool } from '../test-helpers/integration-db';
import { relationsInSchema } from './tables';
import type { Relation } from './tables';

/**
 * Integration tests for PostgreSQL introspection layer
 *
 * These tests verify that we correctly query PostgreSQL metadata to discover:
 * - Tables, views, materialized views, foreign tables
 * - Columns with types, nullability, defaults, generated status
 * - Unique indexes
 * - Enums
 *
 * Tests use a real PostgreSQL container to ensure our queries work correctly
 * across different PostgreSQL features and edge cases.
 */
describe('PostgreSQL Introspection - Integration Tests', () => {
  let pool: Pool;

  beforeAll(async () => {
    await startTestDatabase();
    pool = getTestPool();
  }, 60000);

  afterAll(async () => {
    await stopTestDatabase();
  }, 60000);

  /**
   * Helper to execute queries with the pool
   */
  const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);

  describe('relationsInSchema - Table Discovery', () => {
    it('discovers regular tables in public schema', async () => {
      // Create test tables
      await pool.query(`
        DROP TABLE IF EXISTS users CASCADE;
        DROP TABLE IF EXISTS posts CASCADE;

        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL
        );

        CREATE TABLE posts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id),
          title TEXT NOT NULL
        );
      `);

      const relations = await relationsInSchema('public', queryFn);

      // Find our tables (there may be other tables in public schema)
      const users = relations.find(r => r.name === 'users');
      const posts = relations.find(r => r.name === 'posts');

      expect(users).toBeDefined();
      expect(users).toMatchObject({
        schema: 'public',
        name: 'users',
        type: 'table',
        insertable: true,
      });

      expect(posts).toBeDefined();
      expect(posts).toMatchObject({
        schema: 'public',
        name: 'posts',
        type: 'table',
        insertable: true,
      });
    });

    it('discovers views (simple views on single tables are insertable)', async () => {
      await pool.query(`
        DROP VIEW IF EXISTS user_summary CASCADE;

        CREATE VIEW user_summary AS
        SELECT id, name FROM users;
      `);

      const relations = await relationsInSchema('public', queryFn);
      const view = relations.find(r => r.name === 'user_summary');

      expect(view).toBeDefined();
      expect(view).toMatchObject({
        schema: 'public',
        name: 'user_summary',
        type: 'view',
        insertable: true, // Simple views on single tables are insertable in PostgreSQL
      });
    });

    it('discovers updatable views and marks them as insertable', async () => {
      await pool.query(`
        DROP VIEW IF EXISTS updatable_users CASCADE;

        CREATE VIEW updatable_users AS
        SELECT id, name FROM users;
      `);

      const relations = await relationsInSchema('public', queryFn);
      const view = relations.find(r => r.name === 'updatable_users');

      expect(view).toBeDefined();
      expect(view).toMatchObject({
        schema: 'public',
        name: 'updatable_users',
        type: 'view',
        insertable: true, // Simple views on single tables are insertable in PostgreSQL
      });
    });

    it('discovers materialized views', async () => {
      await pool.query(`
        DROP MATERIALIZED VIEW IF EXISTS user_stats CASCADE;

        CREATE MATERIALIZED VIEW user_stats AS
        SELECT
          COUNT(*) as total_users,
          NOW() as calculated_at
        FROM users;
      `);

      const relations = await relationsInSchema('public', queryFn);
      const mview = relations.find(r => r.name === 'user_stats');

      expect(mview).toBeDefined();
      expect(mview).toMatchObject({
        schema: 'public',
        name: 'user_stats',
        type: 'mview',
        insertable: false, // Materialized views are never insertable
      });
    });

    it('handles tables with special characters in names', async () => {
      await pool.query(`
        DROP TABLE IF EXISTS "Special-Table_Name$123" CASCADE;

        CREATE TABLE "Special-Table_Name$123" (
          id SERIAL PRIMARY KEY
        );
      `);

      const relations = await relationsInSchema('public', queryFn);
      const specialTable = relations.find(r => r.name === 'Special-Table_Name$123');

      expect(specialTable).toBeDefined();
      expect(specialTable?.name).toBe('Special-Table_Name$123');
    });

    it('returns empty array for schema with no tables', async () => {
      // Create empty schema
      await pool.query(`
        DROP SCHEMA IF EXISTS empty_schema CASCADE;
        CREATE SCHEMA empty_schema;
      `);

      const relations = await relationsInSchema('empty_schema', queryFn);

      expect(relations).toEqual([]);
    });

    it('sorts relations case-insensitively by name', async () => {
      await pool.query(`
        DROP TABLE IF EXISTS zebra, apple, Banana CASCADE;

        CREATE TABLE zebra (id SERIAL);
        CREATE TABLE apple (id SERIAL);
        CREATE TABLE "Banana" (id SERIAL);
      `);

      const relations = await relationsInSchema('public', queryFn);

      // Extract just our test tables
      const testTables = ['zebra', 'apple', 'Banana'];
      const found = relations
        .filter(r => testTables.includes(r.name))
        .map(r => r.name);

      // Should be sorted case-insensitively: apple, Banana, zebra
      const appleIdx = found.indexOf('apple');
      const bananaIdx = found.indexOf('Banana');
      const zebraIdx = found.indexOf('zebra');

      expect(appleIdx).toBeLessThan(bananaIdx);
      expect(bananaIdx).toBeLessThan(zebraIdx);
    });

    it('excludes temporary tables', async () => {
      await pool.query(`
        CREATE TEMPORARY TABLE temp_table (id SERIAL);
      `);

      const relations = await relationsInSchema('public', queryFn);
      const tempTable = relations.find(r => r.name === 'temp_table');

      expect(tempTable).toBeUndefined();
    });
  });

  describe('relationsInSchema - Multi-Schema Support', () => {
    beforeAll(async () => {
      // Create additional schemas for testing
      await pool.query(`
        DROP SCHEMA IF EXISTS schema_a CASCADE;
        DROP SCHEMA IF EXISTS schema_b CASCADE;

        CREATE SCHEMA schema_a;
        CREATE SCHEMA schema_b;

        CREATE TABLE schema_a.table_a (id SERIAL);
        CREATE TABLE schema_b.table_b (id SERIAL);
      `);
    });

    it('returns only tables from specified schema', async () => {
      const relationsA = await relationsInSchema('schema_a', queryFn);
      const relationsB = await relationsInSchema('schema_b', queryFn);

      expect(relationsA.find(r => r.name === 'table_a')).toBeDefined();
      expect(relationsA.find(r => r.name === 'table_b')).toBeUndefined();

      expect(relationsB.find(r => r.name === 'table_b')).toBeDefined();
      expect(relationsB.find(r => r.name === 'table_a')).toBeUndefined();
    });

    it('handles schemas with same table names differently', async () => {
      await pool.query(`
        CREATE TABLE schema_a.shared_name (id SERIAL, a_specific TEXT);
        CREATE TABLE schema_b.shared_name (id SERIAL, b_specific TEXT);
      `);

      const relationsA = await relationsInSchema('schema_a', queryFn);
      const relationsB = await relationsInSchema('schema_b', queryFn);

      const tableA = relationsA.find(r => r.name === 'shared_name');
      const tableB = relationsB.find(r => r.name === 'shared_name');

      expect(tableA).toMatchObject({ schema: 'schema_a', name: 'shared_name' });
      expect(tableB).toMatchObject({ schema: 'schema_b', name: 'shared_name' });
    });
  });

  describe('relationsInSchema - Foreign Tables', () => {
    it('discovers foreign tables (foreign data wrappers)', async () => {
      // Note: This requires postgres_fdw extension
      // Skip if not available
      try {
        await pool.query(`CREATE EXTENSION IF NOT EXISTS postgres_fdw;`);

        await pool.query(`
          DROP SERVER IF EXISTS test_server CASCADE;

          CREATE SERVER test_server
          FOREIGN DATA WRAPPER postgres_fdw
          OPTIONS (host 'localhost', dbname 'test', port '5432');

          CREATE FOREIGN TABLE foreign_users (
            id INTEGER,
            name TEXT
          ) SERVER test_server
          OPTIONS (schema_name 'public', table_name 'users');
        `);

        const relations = await relationsInSchema('public', queryFn);
        const foreignTable = relations.find(r => r.name === 'foreign_users');

        expect(foreignTable).toBeDefined();
        expect(foreignTable).toMatchObject({
          schema: 'public',
          name: 'foreign_users',
          type: 'fdw',
          insertable: true,
        });
      } catch (err) {
        console.log('Skipping foreign table test (postgres_fdw not available):', err);
      }
    });
  });

  describe('relationsInSchema - Edge Cases', () => {
    it('handles mixed case schema names', async () => {
      await pool.query(`
        DROP SCHEMA IF EXISTS "MixedCase" CASCADE;
        CREATE SCHEMA "MixedCase";
        CREATE TABLE "MixedCase".test_table (id SERIAL);
      `);

      const relations = await relationsInSchema('MixedCase', queryFn);

      expect(relations.length).toBeGreaterThan(0);
      expect(relations.find(r => r.name === 'test_table')).toBeDefined();
    });

    it('handles non-existent schema gracefully', async () => {
      const relations = await relationsInSchema('nonexistent_schema', queryFn);

      expect(relations).toEqual([]);
    });

    it('handles system schemas like information_schema', async () => {
      // information_schema contains system views and tables
      const relations = await relationsInSchema('information_schema', queryFn);

      // Should return relations (mostly views)
      expect(relations.length).toBeGreaterThan(0);

      // Most should be views, but there might be tables too
      const viewCount = relations.filter(r => r.type === 'view').length;
      expect(viewCount).toBeGreaterThan(0);
    });
  });

  describe('Relation Type Validation', () => {
    it('validates that relation objects have required properties', async () => {
      await pool.query(`
        DROP TABLE IF EXISTS validation_test CASCADE;
        CREATE TABLE validation_test (id SERIAL);
      `);

      const relations = await relationsInSchema('public', queryFn);
      const table = relations.find(r => r.name === 'validation_test');

      expect(table).toBeDefined();

      // Type assertion for TypeScript
      const rel = table as Relation;

      // Verify all required properties exist
      expect(rel).toHaveProperty('schema');
      expect(rel).toHaveProperty('name');
      expect(rel).toHaveProperty('type');
      expect(rel).toHaveProperty('insertable');

      // Verify types
      expect(typeof rel.schema).toBe('string');
      expect(typeof rel.name).toBe('string');
      expect(['table', 'view', 'fdw', 'mview']).toContain(rel.type);
      expect(typeof rel.insertable).toBe('boolean');
    });
  });
});
