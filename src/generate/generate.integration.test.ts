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
import { relationsInSchema, domainsInSchema, definitionForRelationInSchema } from './tables';
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
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Check namespace structure
      expect(result).toContain('export namespace test_users');
      expect(result).toContain("export type Table = 'test_users'");

      // Check Selectable type
      expect(result).toContain('export type Selectable = {');
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
      expect(result).toContain('export type Insertable = {');
      expect(result).toMatch(/name:\s*string/); // required
      expect(result).toMatch(/status\?:/); // optional (has default)
      expect(result).toMatch(/age\?:/); // optional (nullable)

      // Check UniqueIndex
      expect(result).toContain('export type UniqueIndex =');
    });

    it('should handle domain types as custom types', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // email_address domain should be captured as custom type
      expect(customTypes).toHaveProperty('PgEmail_address');
    });

    it('should generate read-only types for materialized views', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_user_stats', type: 'mview' as const, insertable: false };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Insertable and Updatable should be empty for mviews
      expect(result).toContain('export type Insertable = Record<string, never>');
      expect(result).toContain('export type Updatable = Record<string, never>');
    });

    it('should handle generated columns', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_computed', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // full_name should be in Selectable but not in Insertable (generated)
      expect(result).toMatch(/type Selectable = \{[^}]*full_name: string/s);
      // Check full_name is NOT in Insertable
      const insertableMatch = result.match(/type Insertable = \{([^}]*)\}/s);
      expect(insertableMatch?.[1]).not.toContain('full_name');
    });

    it('should quote illegal identifiers', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test with spaces', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      expect(result).toContain('"column with spaces"');
      expect(result).toContain('"123numeric_start"');
      expect(result).toContain('"has-dashes"');
    });

    it('should include unique indexes', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_with_indexes', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      expect(result).toContain("'idx_code'");
      expect(result).toContain("'idx_category_name'");
      expect(result).toContain("'test_with_indexes_pkey'");
    });
  });

  describe('recursive domain types', () => {
    it('should resolve recursive domain to base type for regular tables', async () => {
      // user_age -> positive_int -> integer should resolve to 'number'
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Should have custom type for user_age domain
      expect(customTypes).toHaveProperty('PgUser_age');
      // The base type should be 'number' (from integer), not 'any'
      expect(customTypes['PgUser_age']).toBe('number');
    });

    it('should resolve recursive domain to base type for materialized views', async () => {
      // user_age column uses recursive domain (user_age -> positive_int -> integer)
      // Should resolve to 'number', not 'any'
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      // Use mview that directly selects domain columns (not aggregates)
      const relation = { schema: 'public', name: 'test_user_domains_mview', type: 'mview' as const, insertable: false };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Should have custom types for both email_address and user_age domains
      expect(customTypes).toHaveProperty('PgEmail_address');
      expect(customTypes).toHaveProperty('PgUser_age');
      // The base types should be resolved correctly
      expect(customTypes['PgEmail_address']).toBe('string');
      expect(customTypes['PgUser_age']).toBe('number');
    });
  });

  describe('arrays of domain types', () => {
    it('should create distinct custom type for domain array', async () => {
      // email_addresses (email_address[]) should NOT collide with email (email_address)
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Should have both scalar and array custom types
      expect(customTypes).toHaveProperty('PgEmail_address');
      expect(customTypes).toHaveProperty('PgEmail_address_array');

      // Scalar type should have string type hint
      expect(customTypes['PgEmail_address']).toBe('string');
      // Array type should have array type hint
      expect(customTypes['PgEmail_address_array']).toBe('string[]');
    });

    it('should preserve array semantics in generated TypeScript', async () => {
      // Verify the generated type definition uses the array custom type correctly
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({});
      const customTypes: Record<string, string> = {};

      const relation = { schema: 'public', name: 'test_users', type: 'table' as const, insertable: true };
      const result = await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // email_addresses column should use the array custom type
      expect(result).toContain('email_addresses: c.PgEmail_address_array');
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

  describe('baseTypeMappings config option', () => {
    it('should create base type custom type with mapped TypeScript type', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({
        baseTypeMappings: {
          'test_composite': '[string, string]',
        },
      });
      const customTypes: Record<string, string | { tsType: string; baseTypeRef?: string; isBaseTypeMapping?: boolean }> = {};

      const relation = { schema: 'public', name: 'test_entities', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Base type should have the mapped TypeScript type
      expect(customTypes['PgTest_composite']).toEqual({
        tsType: '[string, string]',
        isBaseTypeMapping: true,
      });
    });

    it('should create domain custom type referencing base type', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({
        baseTypeMappings: {
          'test_composite': '[string, string]',
        },
      });
      const customTypes: Record<string, string | { tsType: string; baseTypeRef?: string; isBaseTypeMapping?: boolean }> = {};

      const relation = { schema: 'public', name: 'test_entities', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Domain should reference the base type
      expect(customTypes['PgEntity_id']).toEqual({
        tsType: 'PgTest_composite',
        baseTypeRef: 'PgTest_composite',
      });

      // Other domain should also reference the base type
      expect(customTypes['PgOther_entity_id']).toEqual({
        tsType: 'PgTest_composite',
        baseTypeRef: 'PgTest_composite',
      });
    });

    it('should handle arrays of domains based on mapped types', async () => {
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({
        baseTypeMappings: {
          'test_composite': '[string, string]',
        },
      });
      const customTypes: Record<string, string | { tsType: string; baseTypeRef?: string; isBaseTypeMapping?: boolean }> = {};

      const relation = { schema: 'public', name: 'test_entities', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Array type should reference base type with []
      expect(customTypes['PgEntity_id_array']).toEqual({
        tsType: 'PgTest_composite[]',
        baseTypeRef: 'PgTest_composite',
      });
    });

    it('should not affect domains when base type is not mapped', async () => {
      // Verify existing behavior is unchanged
      const queryFn = (q: { text: string; values?: unknown[] }) => pool.query(q);
      const enums = await enumDataForSchema('public', queryFn);
      const domains = await domainsInSchema('public', queryFn);
      const config = finaliseConfig({
        baseTypeMappings: {},  // No mappings
      });
      const customTypes: Record<string, string | { tsType: string; baseTypeRef?: string; isBaseTypeMapping?: boolean }> = {};

      const relation = { schema: 'public', name: 'test_entities', type: 'table' as const, insertable: true };
      await definitionForRelationInSchema(relation, 'public', enums, customTypes, config, queryFn, domains);

      // Domain should have 'any' as placeholder (existing behavior)
      expect(customTypes['PgEntity_id']).toBe('any');
      expect(customTypes['PgOther_entity_id']).toBe('any');
      // Arrays of unknown types also get 'any' (not 'any[]') because tsTypeForPgType returns 'any' for unknown arrays
      expect(customTypes['PgEntity_id_array']).toBe('any');
    });

    it('should generate correct file content using tsForConfig', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { public: { include: ['test_entities'], exclude: [] } },
        baseTypeMappings: {
          'test_composite': '[string, string]',
        },
      });

      const debug = () => void 0;
      const { customTypeSourceFiles } = await tsForConfig(config, debug);

      // Base type file should have the mapping from config
      const baseTypeFile = customTypeSourceFiles['PgTest_composite'];
      expect(baseTypeFile).toBeDefined();
      expect(baseTypeFile).toContain('export type PgTest_composite = [string, string];');
      expect(baseTypeFile).toContain('base type mapping from config');

      // Domain file should import and reference base type
      const domainFile = customTypeSourceFiles['PgEntity_id'];
      expect(domainFile).toBeDefined();
      expect(domainFile).toContain("import type { PgTest_composite } from './PgTest_composite';");
      expect(domainFile).toContain('export type PgEntity_id = PgTest_composite;');
      expect(domainFile).toContain('domain based on test_composite');

      // Array file should import and reference base type with []
      const arrayFile = customTypeSourceFiles['PgEntity_id_array'];
      expect(arrayFile).toBeDefined();
      expect(arrayFile).toContain("import type { PgTest_composite } from './PgTest_composite';");
      expect(arrayFile).toContain('export type PgEntity_id_array = PgTest_composite[];');
    });

    it('should generate correct schema referencing custom types', async () => {
      const connectionConfig = getTestConnectionConfig();
      const config = finaliseConfig({
        db: connectionConfig,
        schemas: { public: { include: ['test_entities'], exclude: [] } },
        baseTypeMappings: {
          'test_composite': '[string, string]',
        },
      });

      const debug = () => void 0;
      const { ts } = await tsForConfig(config, debug);

      // Schema should reference custom types (not raw TypeScript types)
      expect(ts).toContain('entity_id: c.PgEntity_id;');
      expect(ts).toContain('other_entity_id: c.PgOther_entity_id | null;');
      expect(ts).toContain('related_ids: c.PgEntity_id_array | null;');
    });
  });
});
