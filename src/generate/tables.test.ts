import { describe, it, expect } from 'vitest';
import { finaliseConfig } from './config';
import {
  quoteIfIllegalIdentifier,
  transformCustomType,
  tableMappedUnion,
  tableMappedArray,
  crossTableTypesForTables,
  crossSchemaTypesForAllTables,
  generateSchemaInterface,
  schemaMappedUnion,
  schemaMappedArray,
  crossSchemaTypesForSchemas,
  createColumnDoc,
  type Relation,
  type ColumnRow,
} from './tables';

describe('tables.ts', () => {
  const defaultConfig = finaliseConfig({});

  describe('quoteIfIllegalIdentifier', () => {
    it('should return identifier unchanged if legal', () => {
      expect(quoteIfIllegalIdentifier('name')).toBe('name');
      expect(quoteIfIllegalIdentifier('_private')).toBe('_private');
      expect(quoteIfIllegalIdentifier('$special')).toBe('$special');
      expect(quoteIfIllegalIdentifier('camelCase')).toBe('camelCase');
      expect(quoteIfIllegalIdentifier('snake_case')).toBe('snake_case');
      expect(quoteIfIllegalIdentifier('with123numbers')).toBe('with123numbers');
    });

    it('should quote identifiers with spaces', () => {
      expect(quoteIfIllegalIdentifier('has space')).toBe('"has space"');
      expect(quoteIfIllegalIdentifier('multiple words here')).toBe('"multiple words here"');
    });

    it('should quote identifiers starting with numbers', () => {
      expect(quoteIfIllegalIdentifier('123start')).toBe('"123start"');
    });

    it('should quote identifiers with special characters', () => {
      expect(quoteIfIllegalIdentifier('has-dash')).toBe('"has-dash"');
      expect(quoteIfIllegalIdentifier('has.dot')).toBe('"has.dot"');
      expect(quoteIfIllegalIdentifier('has@symbol')).toBe('"has@symbol"');
    });

    it('should handle empty string', () => {
      expect(quoteIfIllegalIdentifier('')).toBe('""');
    });
  });

  describe('transformCustomType', () => {
    it('should transform with PgMy_type strategy (default)', () => {
      const config = finaliseConfig({ customTypesTransform: 'PgMy_type' });
      expect(transformCustomType('my_custom_type', config)).toBe('PgMy_custom_type');
      expect(transformCustomType('simple', config)).toBe('PgSimple');
    });

    it('should transform with my_type strategy', () => {
      const config = finaliseConfig({ customTypesTransform: 'my_type' });
      expect(transformCustomType('my_custom_type', config)).toBe('my_custom_type');
      expect(transformCustomType('has-dash', config)).toBe('hasdash');
    });

    it('should transform with PgMyType strategy', () => {
      const config = finaliseConfig({ customTypesTransform: 'PgMyType' });
      expect(transformCustomType('my_custom_type', config)).toBe('PgMyCustomType');
      expect(transformCustomType('simple', config)).toBe('PgSimple');
    });

    it('should use custom transform function', () => {
      const config = finaliseConfig({
        customTypesTransform: (s: string) => `Custom_${s.toUpperCase()}`,
      });
      expect(transformCustomType('my_type', config)).toBe('Custom_MY_TYPE');
    });

    it('should handle types with special characters', () => {
      const config = finaliseConfig({ customTypesTransform: 'PgMy_type' });
      expect(transformCustomType('type.with.dots', config)).toBe('PgType_with_dots');
    });
  });

  describe('tableMappedUnion', () => {
    it('should return never for empty array', () => {
      expect(tableMappedUnion([], 'Selectable')).toBe('never');
    });

    it('should create union for single table', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
      ];
      expect(tableMappedUnion(relations, 'Selectable')).toBe('users.Selectable');
    });

    it('should create union for multiple tables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
        { schema: 'public', name: 'posts', type: 'table', insertable: true },
      ];
      expect(tableMappedUnion(relations, 'Table')).toBe('users.Table | posts.Table');
    });
  });

  describe('tableMappedArray', () => {
    it('should create empty array for no tables', () => {
      expect(tableMappedArray([], 'Table')).toBe('[]');
    });

    it('should create array for single table', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
      ];
      expect(tableMappedArray(relations, 'Table')).toBe('[users.Table]');
    });

    it('should create array for multiple tables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
        { schema: 'public', name: 'posts', type: 'table', insertable: true },
      ];
      expect(tableMappedArray(relations, 'Table')).toBe('[users.Table, posts.Table]');
    });
  });

  describe('crossTableTypesForTables', () => {
    it('should generate aggregate types for tables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
        { schema: 'public', name: 'posts', type: 'table', insertable: true },
      ];
      const result = crossTableTypesForTables(relations);

      expect(result).toContain('export type Table =');
      expect(result).toContain('export type Selectable =');
      expect(result).toContain('export type Insertable =');
      expect(result).toContain('export type Updatable =');
      expect(result).toContain('export type AllBaseTables =');
    });

    it('should filter by relation type for AllBaseTables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
        { schema: 'public', name: 'user_view', type: 'view', insertable: false },
        { schema: 'public', name: 'cached_data', type: 'mview', insertable: false },
      ];
      const result = crossTableTypesForTables(relations);

      expect(result).toContain('AllBaseTables = [users.Table]');
      expect(result).toContain('AllViews = [user_view.Table]');
      expect(result).toContain('AllMaterializedViews = [cached_data.Table]');
    });

    it('should handle empty table list', () => {
      const result = crossTableTypesForTables([]);
      expect(result).toContain('never');
      expect(result).toContain('// `never` rather than `any` types');
    });
  });

  describe('generateSchemaInterface', () => {
    it('should generate Schema interface for tables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
      ];
      const result = generateSchemaInterface(relations, 'public');

      expect(result).toContain('export interface Schema extends db.BaseSchema');
      expect(result).toContain("'users':");
      expect(result).toContain('Table: users.Table');
      expect(result).toContain('Selectable: users.Selectable');
    });

    it('should prefix non-unprefixed schema tables', () => {
      const relations: Relation[] = [
        { schema: 'audit', name: 'logs', type: 'table', insertable: true },
      ];
      const result = generateSchemaInterface(relations, 'public');

      expect(result).toContain("'audit.logs':");
      expect(result).toContain('Table: audit.logs.Table');
    });

    it('should handle empty table list', () => {
      const result = generateSchemaInterface([], 'public');
      expect(result).toContain('tables: {');
      expect(result).toContain('}');
    });
  });

  describe('schemaMappedUnion', () => {
    it('should return any for empty array', () => {
      expect(schemaMappedUnion([], 'Table')).toBe('any');
    });

    it('should create union for schemas', () => {
      expect(schemaMappedUnion(['public', 'audit'], 'Table')).toBe('public.Table | audit.Table');
    });
  });

  describe('schemaMappedArray', () => {
    it('should create spread array for schemas', () => {
      expect(schemaMappedArray(['public', 'audit'], 'AllBaseTables')).toBe(
        '[...public.AllBaseTables, ...audit.AllBaseTables]'
      );
    });
  });

  describe('crossSchemaTypesForSchemas', () => {
    it('should generate cross-schema types', () => {
      const result = crossSchemaTypesForSchemas(['public', 'audit']);

      expect(result).toContain("export type SchemaName = 'public' | 'audit'");
      expect(result).toContain('export type Table =');
      expect(result).toContain('export type AllSchemas =');
    });
  });

  describe('createColumnDoc', () => {
    const baseColumn: ColumnRow = {
      column: 'test_col',
      isNullable: false,
      isGenerated: false,
      hasDefault: false,
      defaultValue: null,
      udtName: 'text',
      domainName: null,
      description: null,
    };

    const baseRelation: Relation = {
      schema: 'public',
      name: 'test_table',
      type: 'table',
      insertable: true,
    };

    it('should return empty string when schemaJSDoc is false', () => {
      const config = finaliseConfig({ schemaJSDoc: false });
      const result = createColumnDoc(config, 'public', baseRelation, baseColumn);
      expect(result).toBe('');
    });

    it('should generate JSDoc with column name and type', () => {
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, baseColumn);
      expect(result).toContain('**test_table.test_col**');
      expect(result).toContain('`text` in database');
    });

    it('should include description when present', () => {
      const columnWithDesc = { ...baseColumn, description: 'User email address' };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, columnWithDesc);
      expect(result).toContain('User email address');
    });

    it('should show nullable status', () => {
      const nullableCol = { ...baseColumn, isNullable: true };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, nullableCol);
      expect(result).toContain('Nullable');
    });

    it('should show NOT NULL status', () => {
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, baseColumn);
      expect(result).toContain('`NOT NULL`');
    });

    it('should show default value', () => {
      const colWithDefault = { ...baseColumn, hasDefault: true, defaultValue: "'active'" };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, colWithDefault);
      expect(result).toContain("default: `'active'`");
    });

    it('should show identity column indicator', () => {
      const identityCol = { ...baseColumn, hasDefault: true, defaultValue: null };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, identityCol);
      expect(result).toContain('identity column');
    });

    it('should show generated column indicator', () => {
      const generatedCol = { ...baseColumn, isGenerated: true };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, generatedCol);
      expect(result).toContain('Generated column');
    });

    it('should show domain type info', () => {
      const domainCol = { ...baseColumn, domainName: 'email_domain', udtName: 'text' };
      const result = createColumnDoc(defaultConfig, 'public', baseRelation, domainCol);
      expect(result).toContain('`email_domain` (base type: `text`)');
    });

    it('should include schema prefix for non-unprefixed schemas', () => {
      const result = createColumnDoc(defaultConfig, 'audit', baseRelation, baseColumn);
      expect(result).toContain('**audit.test_table.test_col**');
    });

    it('should show materialized view indicator', () => {
      const mviewRelation: Relation = { ...baseRelation, type: 'mview' };
      const result = createColumnDoc(defaultConfig, 'public', mviewRelation, baseColumn);
      expect(result).toContain('Materialized view column');
    });
  });

  describe('crossSchemaTypesForAllTables', () => {
    it('should generate lookup types for tables', () => {
      const relations: Relation[] = [
        { schema: 'public', name: 'users', type: 'table', insertable: true },
        { schema: 'public', name: 'posts', type: 'table', insertable: true },
      ];
      const result = crossSchemaTypesForAllTables(relations, 'public');

      expect(result).toContain('export type SelectableForTable<T extends Table>');
      expect(result).toContain('"users": users.Selectable');
      expect(result).toContain('"posts": posts.Selectable');
    });

    it('should prefix schema for non-unprefixed tables', () => {
      const relations: Relation[] = [
        { schema: 'audit', name: 'logs', type: 'table', insertable: true },
      ];
      const result = crossSchemaTypesForAllTables(relations, 'public');

      expect(result).toContain('"audit.logs": audit.logs.Selectable');
    });

    it('should return any for empty tables', () => {
      const result = crossSchemaTypesForAllTables([], 'public');
      expect(result).toContain('= any');
    });
  });
});
