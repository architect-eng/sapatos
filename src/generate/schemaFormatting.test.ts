import { describe, it, expect } from 'vitest';
import { createMockRelation } from './__fixtures__/common-fixtures';
import type { Relation, UniqueIndexRow } from './introspection';
import {
  formatStructureMapEntry,
  formatNamespaceAlias,
  formatSchemaNamespaces,
  formatSQLExpressionType,
  formatCrossTableTypes,
  formatCrossSchemaTypesForTables,
  formatCrossSchemaTypesForSchemas,
  type RelationData,
} from './schemaFormatting';

describe('schemaFormatting Module', () => {
  // Helper to create test RelationData
  const createTestRelationData = (overrides: Partial<RelationData> = {}): RelationData => ({
    rel: createMockRelation('users'),
    schemaName: 'public',
    schemaPrefix: '',
    selectables: ['id: number', 'name: string', 'email: string | null'],
    JSONSelectables: ['id: number', 'name: string', 'email: string | null'],
    whereables: ['id?: number | db.SQLFragment', 'name?: string | db.SQLFragment', 'email?: string | null | db.SQLFragment'],
    insertables: ['name: string', 'email?: string | null | db.DefaultType'],
    updatables: ['name?: string', 'email?: string | null'],
    uniqueIndexes: [{ indexname: 'users_pkey' }, { indexname: 'users_email_key' }] as UniqueIndexRow[],
    columns: ['id', 'name', 'email'],
    friendlyRelType: 'table',
    tableComment: '',
    ...overrides,
  });

  describe('formatStructureMapEntry', () => {
    it('generates entry with table name key', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain("'users': {");
    });

    it('includes Table property with table name', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain("Table: 'users'");
    });

    it('formats Selectable with all column types', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Selectable: {');
      expect(result).toContain('id: number');
      expect(result).toContain('name: string');
      expect(result).toContain('email: string | null');
    });

    it('formats JSONSelectable with JSON-safe types', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('JSONSelectable: {');
      expect(result).toContain('id: number');
    });

    it('formats Whereable with optional and SQLFragment unions', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Whereable: {');
      expect(result).toContain('id?: number | db.SQLFragment');
    });

    it('formats Insertable with required and optional fields', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Insertable: {');
      expect(result).toContain('name: string');
      expect(result).toContain('email?: string | null | db.DefaultType');
    });

    it('formats Updatable with all optional fields', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Updatable: {');
      expect(result).toContain('name?: string');
      expect(result).toContain('email?: string | null');
    });

    it('formats empty Insertable as [key: string]: never', () => {
      const data = createTestRelationData({ insertables: [] });
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Insertable: {');
      expect(result).toContain('[key: string]: never;');
    });

    it('formats empty Updatable as [key: string]: never', () => {
      const data = createTestRelationData({ updatables: [] });
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Updatable: {');
      expect(result).toContain('[key: string]: never;');
    });

    it('includes UniqueIndex union type', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('UniqueIndex: ');
      expect(result).toContain("'users_pkey' | 'users_email_key'");
    });

    it('uses never for empty UniqueIndex', () => {
      const data = createTestRelationData({ uniqueIndexes: [] });
      const result = formatStructureMapEntry(data);
      expect(result).toContain('UniqueIndex: never');
    });

    it('includes Column union type', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Column: ');
      expect(result).toContain('id | name | email');
    });

    it('quotes illegal identifier columns', () => {
      const data = createTestRelationData({ columns: ['user-id', 'full name'] });
      const result = formatStructureMapEntry(data);
      expect(result).toContain('Column: ');
      expect(result).toContain('"user-id"');
      expect(result).toContain('"full name"');
    });

    it('includes SQL property referencing SQLExpression type', () => {
      const data = createTestRelationData();
      const result = formatStructureMapEntry(data);
      expect(result).toContain('SQL: usersSQLExpression');
    });

    it('uses schema prefix for table name when provided', () => {
      const data = createTestRelationData({ schemaPrefix: 'auth.', schemaName: 'auth' });
      const result = formatStructureMapEntry(data);
      expect(result).toContain("'auth.users': {");
      expect(result).toContain("Table: 'auth.users'");
      expect(result).toContain('SQL: auth_usersSQLExpression');
    });
  });

  describe('formatNamespaceAlias', () => {
    it('generates namespace with table name', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain('export namespace users {');
    });

    it('exports Table type aliasing StructureMap', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Table = StructureMap['users']['Table']");
    });

    it('exports Selectable type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Selectable = StructureMap['users']['Selectable']");
    });

    it('exports JSONSelectable type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type JSONSelectable = StructureMap['users']['JSONSelectable']");
    });

    it('exports Whereable type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Whereable = StructureMap['users']['Whereable']");
    });

    it('exports Insertable type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Insertable = StructureMap['users']['Insertable']");
    });

    it('exports Updatable type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Updatable = StructureMap['users']['Updatable']");
    });

    it('exports UniqueIndex type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type UniqueIndex = StructureMap['users']['UniqueIndex']");
    });

    it('exports Column type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain("export type Column = StructureMap['users']['Column']");
    });

    it('exports OnlyCols utility type', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain('export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>');
    });

    it('exports SQLExpression type with full union', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain('export type SQLExpression = ');
      expect(result).toContain('Table | db.ColumnNames');
    });

    it('exports SQL type as array of SQLExpression', () => {
      const data = createTestRelationData();
      const result = formatNamespaceAlias(data);
      expect(result).toContain('export type SQL = SQLExpression | SQLExpression[]');
    });

    it('uses unprefixed name for namespace even with schema prefix', () => {
      const data = createTestRelationData({ schemaPrefix: 'auth.', schemaName: 'auth' });
      const result = formatNamespaceAlias(data);
      expect(result).toContain('export namespace users {');
      expect(result).toContain("StructureMap['auth.users']");
    });

    it('includes table comment when present', () => {
      const data = createTestRelationData({ tableComment: '/** User account information */\n' });
      const result = formatNamespaceAlias(data);
      expect(result).toContain('/** User account information */');
    });
  });

  describe('formatSchemaNamespaces', () => {
    it('keeps unprefixed schema tables flat', () => {
      const data = createTestRelationData({ schemaPrefix: '', schemaName: 'public' });
      const result = formatSchemaNamespaces([data], 'public');
      expect(result).toContain('export namespace users {');
      expect(result).not.toContain('export namespace public {');
      expect(result).toContain("StructureMap['users']");
    });

    it('nests non-default schema tables under schema namespace', () => {
      const authData = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('users'), schema: 'auth', name: 'users' }
      });
      const result = formatSchemaNamespaces([authData], 'public');
      expect(result).toContain('export namespace auth {');
      expect(result).toContain('export namespace users {');
      expect(result).toContain("StructureMap['auth.users']");
    });

    it('handles multiple schemas correctly', () => {
      const publicData = createTestRelationData({
        schemaPrefix: '',
        schemaName: 'public',
        rel: { ...createMockRelation('users'), schema: 'public', name: 'users' }
      });
      const authData = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('sessions'), schema: 'auth', name: 'sessions' }
      });
      const result = formatSchemaNamespaces([publicData, authData], 'public');

      // Public schema table should be flat
      expect(result).toContain('export namespace users {');
      expect(result).not.toContain('export namespace public {');

      // Auth schema should be nested
      expect(result).toContain('export namespace auth {');
      expect(result).toContain('export namespace sessions {');
    });

    it('handles multiple tables in same non-default schema', () => {
      const authUsers = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('users'), schema: 'auth', name: 'users' }
      });
      const authSessions = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('sessions'), schema: 'auth', name: 'sessions' }
      });
      const result = formatSchemaNamespaces([authUsers, authSessions], 'public');

      // Should have one auth namespace containing both tables
      expect(result).toContain('export namespace auth {');
      expect(result).toContain('export namespace users {');
      expect(result).toContain('export namespace sessions {');

      // Count occurrences of 'export namespace auth' - should be 1
      const authNamespaceCount = (result.match(/export namespace auth \{/g) || []).length;
      expect(authNamespaceCount).toBe(1);
    });

    it('handles null unprefixedSchema by nesting all schemas', () => {
      const publicData = createTestRelationData({
        schemaPrefix: 'public.',
        schemaName: 'public',
        rel: { ...createMockRelation('users'), schema: 'public', name: 'users' }
      });
      const result = formatSchemaNamespaces([publicData], null);

      // All schemas should be nested when unprefixedSchema is null
      expect(result).toContain('export namespace public {');
      expect(result).toContain('export namespace users {');
    });

    it('includes all type exports in table namespaces', () => {
      const data = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('users'), schema: 'auth', name: 'users' }
      });
      const result = formatSchemaNamespaces([data], 'public');

      expect(result).toContain('export type Table =');
      expect(result).toContain('export type Selectable =');
      expect(result).toContain('export type JSONSelectable =');
      expect(result).toContain('export type Whereable =');
      expect(result).toContain('export type Insertable =');
      expect(result).toContain('export type Updatable =');
      expect(result).toContain('export type UniqueIndex =');
      expect(result).toContain('export type Column =');
      expect(result).toContain('export type OnlyCols<T extends readonly Column[]> =');
      expect(result).toContain('export type SQLExpression =');
      expect(result).toContain('export type SQL =');
    });

    it('preserves table comments in nested namespaces', () => {
      const data = createTestRelationData({
        schemaPrefix: 'auth.',
        schemaName: 'auth',
        rel: { ...createMockRelation('users'), schema: 'auth', name: 'users' },
        tableComment: '/** Authentication users table */\n'
      });
      const result = formatSchemaNamespaces([data], 'public');
      expect(result).toContain('/** Authentication users table */');
    });
  });

  describe('formatSQLExpressionType', () => {
    it('generates type name with table prefix', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain('type usersSQLExpression = ');
    });

    it('includes table name literal', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain("'users'");
    });

    it('includes ColumnNames utility type', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain("db.ColumnNames<StructureMap['users']['Updatable']");
    });

    it('includes ColumnValues utility type', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain("db.ColumnValues<StructureMap['users']['Updatable']>");
    });

    it('includes Whereable reference', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain("StructureMap['users']['Whereable']");
    });

    it('includes Column reference', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain("StructureMap['users']['Column']");
    });

    it('includes ParentColumn utility', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain('db.ParentColumn');
    });

    it('includes GenericSQLExpression utility', () => {
      const data = createTestRelationData();
      const result = formatSQLExpressionType(data);
      expect(result).toContain('db.GenericSQLExpression');
    });

    it('sanitizes schema prefix in type name when provided', () => {
      const data = createTestRelationData({ schemaPrefix: 'auth.', schemaName: 'auth' });
      const result = formatSQLExpressionType(data);
      expect(result).toContain('type auth_usersSQLExpression = ');
      expect(result).toContain("'auth.users'");
    });
  });

  describe('formatCrossTableTypes', () => {
    const mockTables: Relation[] = [
      createMockRelation('users', { type: 'table' }),
      createMockRelation('posts', { type: 'table' }),
      createMockRelation('comments', { type: 'view' }),
    ];

    it('generates Table union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Table = users.Table | posts.Table | comments.Table');
    });

    it('generates Selectable union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Selectable = users.Selectable | posts.Selectable | comments.Selectable');
    });

    it('generates JSONSelectable union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type JSONSelectable = users.JSONSelectable | posts.JSONSelectable | comments.JSONSelectable');
    });

    it('generates Whereable union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Whereable = users.Whereable | posts.Whereable | comments.Whereable');
    });

    it('generates Insertable union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Insertable = users.Insertable | posts.Insertable | comments.Insertable');
    });

    it('generates Updatable union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Updatable = users.Updatable | posts.Updatable | comments.Updatable');
    });

    it('generates UniqueIndex union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type UniqueIndex = users.UniqueIndex | posts.UniqueIndex | comments.UniqueIndex');
    });

    it('generates Column union type', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type Column = users.Column | posts.Column | comments.Column');
    });

    it('generates AllBaseTables array type with only tables', () => {
      const result = formatCrossTableTypes(mockTables);
      // Verify the exact AllBaseTables declaration excludes comments (which is a view)
      expect(result).toContain('export type AllBaseTables = [users.Table, posts.Table]');
      // Verify comments only appears in AllViews, not AllBaseTables
      expect(result).toMatch(/export type AllBaseTables = \[users\.Table, posts\.Table\]/);
    });

    it('generates AllViews array type with only views', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type AllViews = [comments.Table]');
    });

    it('generates AllTablesAndViews with all relations', () => {
      const result = formatCrossTableTypes(mockTables);
      expect(result).toContain('export type AllTablesAndViews = [users.Table, posts.Table, comments.Table]');
    });

    it('handles empty tables array with never types', () => {
      const result = formatCrossTableTypes([]);
      expect(result).toContain('export type Table = never');
      expect(result).toContain('export type Selectable = never');
    });

    it('includes warning comment for empty tables', () => {
      const result = formatCrossTableTypes([]);
      expect(result).toContain('// `never` rather than `any` types would be more accurate');
    });

    it('filters foreign tables for AllForeignTables', () => {
      const tablesWithFdw = [
        ...mockTables,
        createMockRelation('remote_data', { type: 'fdw' }),
      ];
      const result = formatCrossTableTypes(tablesWithFdw);
      expect(result).toContain('export type AllForeignTables = [remote_data.Table]');
    });

    it('filters materialized views for AllMaterializedViews', () => {
      const tablesWithMview = [
        ...mockTables,
        createMockRelation('user_stats', { type: 'mview' }),
      ];
      const result = formatCrossTableTypes(tablesWithMview);
      expect(result).toContain('export type AllMaterializedViews = [user_stats.Table]');
    });
  });

  describe('formatCrossSchemaTypesForTables', () => {
    const mockTables: Relation[] = [
      { schema: 'public', name: 'users', type: 'table', insertable: true },
      { schema: 'public', name: 'posts', type: 'table', insertable: true },
      { schema: 'auth', name: 'sessions', type: 'table', insertable: true },
    ];

    it('generates SelectableForTable conditional type', () => {
      const result = formatCrossSchemaTypesForTables(mockTables, 'public');
      expect(result).toContain('export type SelectableForTable<T extends Table>');
    });

    it('maps unprefixed schema tables without schema prefix', () => {
      const result = formatCrossSchemaTypesForTables(mockTables, 'public');
      expect(result).toContain('"users": users.Selectable');
      expect(result).toContain('"posts": posts.Selectable');
    });

    it('maps prefixed schema tables with schema prefix', () => {
      const result = formatCrossSchemaTypesForTables(mockTables, 'public');
      expect(result).toContain('"auth.sessions": auth.sessions.Selectable');
    });

    it('generates types for all thingable variants', () => {
      const result = formatCrossSchemaTypesForTables(mockTables, 'public');
      expect(result).toContain('export type SelectableForTable');
      expect(result).toContain('export type JSONSelectableForTable');
      expect(result).toContain('export type WhereableForTable');
      expect(result).toContain('export type InsertableForTable');
      expect(result).toContain('export type UpdatableForTable');
      expect(result).toContain('export type UniqueIndexForTable');
      expect(result).toContain('export type ColumnForTable');
      expect(result).toContain('export type SQLForTable');
    });

    it('handles empty tables with any type', () => {
      const result = formatCrossSchemaTypesForTables([], 'public');
      expect(result).toContain('any');
    });

    it('handles null unprefixedSchema', () => {
      const result = formatCrossSchemaTypesForTables(mockTables, null);
      expect(result).toContain('"public.users": public.users.Selectable');
      expect(result).toContain('"public.posts": public.posts.Selectable');
    });
  });

  describe('formatCrossSchemaTypesForSchemas', () => {
    const mockSchemas = ['public', 'auth', 'admin'];

    it('generates Schema literal union', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain("export type Schema = 'public' | 'auth' | 'admin'");
    });

    it('generates Table union across schemas', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type Table = public.Table | auth.Table | admin.Table');
    });

    it('generates Selectable union across schemas', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type Selectable = public.Selectable | auth.Selectable | admin.Selectable');
    });

    it('generates all type unions', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type JSONSelectable = ');
      expect(result).toContain('export type Whereable = ');
      expect(result).toContain('export type Insertable = ');
      expect(result).toContain('export type Updatable = ');
      expect(result).toContain('export type UniqueIndex = ');
      expect(result).toContain('export type Column = ');
    });

    it('generates AllSchemas tuple', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain("export type AllSchemas = ['public', 'auth', 'admin']");
    });

    it('generates AllBaseTables with spread syntax', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type AllBaseTables = [...public.AllBaseTables, ...auth.AllBaseTables, ...admin.AllBaseTables]');
    });

    it('generates AllForeignTables with spread syntax', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type AllForeignTables = [...public.AllForeignTables, ...auth.AllForeignTables, ...admin.AllForeignTables]');
    });

    it('generates AllViews with spread syntax', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type AllViews = [...public.AllViews, ...auth.AllViews, ...admin.AllViews]');
    });

    it('generates AllMaterializedViews with spread syntax', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type AllMaterializedViews = [...public.AllMaterializedViews, ...auth.AllMaterializedViews, ...admin.AllMaterializedViews]');
    });

    it('generates AllTablesAndViews with spread syntax', () => {
      const result = formatCrossSchemaTypesForSchemas(mockSchemas);
      expect(result).toContain('export type AllTablesAndViews = [...public.AllTablesAndViews, ...auth.AllTablesAndViews, ...admin.AllTablesAndViews]');
    });

    it('handles single schema', () => {
      const result = formatCrossSchemaTypesForSchemas(['public']);
      expect(result).toContain("export type Schema = 'public'");
      expect(result).toContain('export type Table = public.Table');
    });

    it('handles empty schema array with any fallback', () => {
      const result = formatCrossSchemaTypesForSchemas([]);
      expect(result).toContain('export type Table = any');
    });
  });
});
