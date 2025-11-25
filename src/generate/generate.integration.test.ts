import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  setupGenerateTestSchema,
  cleanGenerateTestSchema,
} from '../test-helpers/generate-test-schema';
import {
  startTestDatabase,
  stopTestDatabase,
  getTestConnectionConfig,
  type TestDatabase,
} from '../test-helpers/integration-db';
import { finaliseConfig } from './config';
import { enumDataForSchema } from './enums';
import { relationsInSchema, definitionForRelationInSchema } from './tables';
import { tsForConfig } from './tsOutput';

describe('generate - Integration Tests', () => {
  let db: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    db = await startTestDatabase();
    pool = db.pool;
    await cleanGenerateTestSchema(pool);
    await setupGenerateTestSchema(pool);
  }, 60000);

  afterAll(async () => {
    await cleanGenerateTestSchema(pool);
    await stopTestDatabase();
  }, 60000);

  describe('enumDataForSchema', () => {
    it('should retrieve all enums from schema', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);

      expect(enums).toHaveProperty('user_status');
      expect(enums).toHaveProperty('priority_level');
      expect(enums.user_status).toEqual(['active', 'inactive', 'pending']);
      // Note: PostgreSQL sorts enum values alphabetically
      expect(enums.priority_level).toContain('low');
      expect(enums.priority_level).toContain('medium');
      expect(enums.priority_level).toContain('high');
      expect(enums.priority_level).toContain('critical');
    });

    it('should return empty object for schema with no enums', async () => {
      // Create a temporary schema with no enums
      await pool.query('CREATE SCHEMA IF NOT EXISTS empty_schema;');
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('empty_schema', queryFn);
      await pool.query('DROP SCHEMA IF EXISTS empty_schema;');

      expect(enums).toEqual({});
    });
  });

  describe('relationsInSchema', () => {
    it('should retrieve all relations from schema', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const relations = await relationsInSchema('public', queryFn);

      const tableNames = relations.map(r => r.name);
      expect(tableNames).toContain('test_users');
      expect(tableNames).toContain('test_nullable_table');
      expect(tableNames).toContain('test_computed');
      expect(tableNames).toContain('test_with_indexes');
      expect(tableNames).toContain('test with spaces');
    });

    it('should identify table types correctly', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const relations = await relationsInSchema('public', queryFn);

      const usersTable = relations.find(r => r.name === 'test_users');
      const userView = relations.find(r => r.name === 'test_user_summary');
      const userStats = relations.find(r => r.name === 'test_user_stats');

      expect(usersTable?.type).toBe('table');
      expect(usersTable?.insertable).toBe(true);
      expect(userView?.type).toBe('view');
      expect(userStats?.type).toBe('mview');
      expect(userStats?.insertable).toBe(false);
    });

    it('should sort relations case-insensitively', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const relations = await relationsInSchema('public', queryFn);
      const names = relations.map(r => r.name.toLowerCase());

      const sortedNames = [...names].sort();
      expect(names).toEqual(sortedNames);
    });
  });

  describe('definitionForRelationInSchema', () => {
    it('should generate type definition for table with various columns', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      // Check namespace structure
      expect(result).toContain('export namespace test_users');
      expect(result).toContain("export type Table = 'test_users'");

      // Check Selectable interface
      expect(result).toContain('export interface Selectable');
      expect(result).toContain('id: number');
      expect(result).toContain('name: string');
      expect(result).toContain('status: user_status | null');
      expect(result).toContain('is_admin: boolean | null');
      expect(result).toContain('metadata: db.JSONValue | null');
      expect(result).toContain('avatar: Buffer | null');
      expect(result).toContain('created_at: Date | null');
      expect(result).toContain('tags: string[] | null');
      expect(result).toContain('scores: number[] | null');

      // Check Insertable has proper optionality
      expect(result).toContain('export interface Insertable');
      expect(result).toMatch(/name:\s*string/); // required
      expect(result).toMatch(/status\?:/); // optional (has default)
      expect(result).toMatch(/age\?:/); // optional (nullable)

      // Check UniqueIndex
      expect(result).toContain('export type UniqueIndex =');
    });

    it('should handle domain types as custom types', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      // email_address domain should be captured as custom type
      expect(customTypes).toHaveProperty('PgEmail_address');
    });

    it('should generate read-only types for materialized views', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_user_stats', type: 'mview' as const, insertable: false };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      // Insertable and Updatable should be empty for mviews
      expect(result).toContain('export interface Insertable {');
      expect(result).toContain('[key: string]: never;');
    });

    it('should handle generated columns', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_computed', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      // full_name should be in Selectable but not in Insertable (generated)
      expect(result).toMatch(/interface Selectable[^}]*full_name: string/s);
      // Check full_name is NOT in Insertable
      const insertableMatch = result.match(/interface Insertable \{([^}]*)\}/s);
      expect(insertableMatch?.[1]).not.toContain('full_name');
    });

    it('should quote illegal identifiers', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test with spaces', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      expect(result).toContain('"column with spaces"');
      expect(result).toContain('"123numeric_start"');
      expect(result).toContain('"has-dashes"');
    });

    it('should include unique indexes', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_with_indexes', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn);

      expect(result).toContain("'idx_code'");
      expect(result).toContain("'idx_category_name'");
      expect(result).toContain("'test_with_indexes_pkey'");
    });
  });

  describe('tsForConfig', () => {
    it('should generate complete TypeScript schema', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { public: { include: '*', exclude: [] } },
        schemaJSDoc: true,
      });

      const debug = () => void 0; // suppress debug output
      const { ts, customTypeSourceFiles } = await tsForConfig(config, debug);

      // Check header
      expect(ts).toContain('**CRITICAL: DO NOT EDIT THIS FILE**');

      // Check imports
      expect(ts).toContain("import type * as db from '@architect-eng/sapatos/db'");

      // Check version canary
      expect(ts).toContain('schemaVersionCanary');

      // Check schema section
      expect(ts).toContain('/* === schema: public === */');

      // Check enum generation
      expect(ts).toContain("export type user_status = 'active' | 'inactive' | 'pending'");
      expect(ts).toContain("export type priority_level =");

      // Check table namespace generation
      expect(ts).toContain('export namespace test_users');
      expect(ts).toContain('export namespace test_nullable_table');

      // Check Schema interface
      expect(ts).toContain('export interface Schema extends db.BaseSchema');

      // Check aggregate types
      expect(ts).toContain('export type Table =');
      expect(ts).toContain('export type Selectable =');

      // Check custom types were captured
      expect(customTypeSourceFiles).toHaveProperty('PgEmail_address');
    });

    it('should respect schema include/exclude rules', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: {
          public: {
            include: ['test_users', 'test_nullable_table'],
            exclude: [],
          },
        },
      });

      const debug = () => void 0;
      const { ts } = await tsForConfig(config, debug);

      expect(ts).toContain('export namespace test_users');
      expect(ts).toContain('export namespace test_nullable_table');
      expect(ts).not.toContain('export namespace test_computed');
      expect(ts).not.toContain('export namespace test_with_indexes');
    });

    it('should exclude tables via exclude rule', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: {
          public: {
            include: '*',
            exclude: ['test_user_stats', 'test_user_summary'],
          },
        },
      });

      const debug = () => void 0;
      const { ts } = await tsForConfig(config, debug);

      expect(ts).toContain('export namespace test_users');
      expect(ts).not.toContain('export namespace test_user_stats');
      expect(ts).not.toContain('export namespace test_user_summary');
    });

    it('should handle schemaJSDoc: false', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { public: { include: ['test_users'], exclude: [] } },
        schemaJSDoc: false,
      });

      const debug = () => void 0;
      const { ts } = await tsForConfig(config, debug);

      // Should not have JSDoc comments for columns
      expect(ts).not.toContain('* **test_users.');
    });

    it('should generate custom type files with correct content', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { public: { include: ['test_users'], exclude: [] } },
      });

      const debug = () => void 0;
      const { customTypeSourceFiles } = await tsForConfig(config, debug);

      const emailFile = customTypeSourceFiles['PgEmail_address'];
      expect(emailFile).toBeDefined();
      expect(emailFile).toContain('Please edit this file as needed');
      expect(emailFile).toContain('export type PgEmail_address =');
    });
  });
});
