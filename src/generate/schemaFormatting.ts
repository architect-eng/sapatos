/**
 * Schema Formatting Module
 *
 * Pure formatting functions that generate TypeScript type definitions
 * from structured database schema data.
 *
 * Responsibilities:
 * - Format StructureMap entries
 * - Format namespace aliases
 * - Format SQLExpression types
 * - Format cross-table and cross-schema types
 *
 * This module contains NO business logic, database queries, or side effects.
 * It only transforms structured data into TypeScript string output.
 */

import type { Relation, UniqueIndexRow } from './introspection';
import { quoteIfIllegalIdentifier, sanitizeTypeIdentifier } from './typeTransformation';

/**
 * Interface containing structured data for a table/view relation
 * Re-exported from tables.ts for use in formatters
 */
export interface RelationData {
  rel: Relation;
  schemaName: string;
  schemaPrefix: string;
  selectables: string[];
  JSONSelectables: string[];
  whereables: string[];
  insertables: string[];
  updatables: string[];
  uniqueIndexes: UniqueIndexRow[];
  columns: string[]; // column names
  friendlyRelType: string;
  tableComment: string;
}

// ============================================================================
// Helper Functions - Internal Utilities
// ============================================================================

/**
 * Create a union type from relation array and suffix
 * Example: "User.Table | Post.Table | Comment.Table"
 */
const tableMappedUnion = (arr: Relation[], suffix: string): string =>
  arr.length === 0 ? 'never' : arr.map(rel => `${rel.name}.${suffix}`).join(' | ');

/**
 * Create an array type from relation array and suffix
 * Example: "[User.Table, Post.Table, Comment.Table]"
 */
const tableMappedArray = (arr: Relation[], suffix: string): string =>
  '[' + arr.map(rel => `${rel.name}.${suffix}`).join(', ') + ']';

/**
 * Create a union type from schema array and suffix
 * Example: "public.Table | admin.Table | auth.Table"
 */
const schemaMappedUnion = (arr: string[], suffix: string): string =>
  arr.length === 0 ? 'any' : arr.map(s => `${s}.${suffix}`).join(' | ');

/**
 * Create a spread array type from schema array and suffix
 * Example: "[...public.AllBaseTables, ...admin.AllBaseTables]"
 */
const schemaMappedArray = (arr: string[], suffix: string): string =>
  '[' + arr.map(s => `...${s}.${suffix}`).join(', ') + ']';

// ============================================================================
// Relation-Level Formatters
// ============================================================================

/**
 * Generate StructureMap entry for a relation
 *
 * Formats a complete StructureMap entry with all type interfaces
 * for a single table/view.
 */
export const formatStructureMapEntry = (data: RelationData): string => {
  const { rel, schemaPrefix, selectables, JSONSelectables, whereables, insertables, updatables, uniqueIndexes, columns } = data;
  const tableName = `${schemaPrefix}${rel.name}`;
  const sanitizedTypeName = sanitizeTypeIdentifier(tableName);
  const quotedColumns = columns.map(c => quoteIfIllegalIdentifier(c));

  return `    '${tableName}': {
      Table: '${tableName}';
      Selectable: {
        ${selectables.join('\n        ')}
      };
      JSONSelectable: {
        ${JSONSelectables.join('\n        ')}
      };
      Whereable: {
        ${whereables.join('\n        ')}
      };
      Insertable: {
        ${insertables.length > 0 ? insertables.join('\n        ') : `[key: string]: never;`}
      };
      Updatable: {
        ${updatables.length > 0 ? updatables.join('\n        ') : `[key: string]: never;`}
      };
      UniqueIndex: ${uniqueIndexes.length > 0 ?
        uniqueIndexes.map((ui: UniqueIndexRow) => `'${ui.indexname}'`).join(' | ') :
        'never'};
      Column: ${quotedColumns.length > 0 ?
        quotedColumns.join(' | ') :
        'never'};
      SQL: ${sanitizedTypeName}SQLExpression;
    };`;
};

/**
 * Generate namespace alias for a relation
 *
 * Creates backward-compatible namespace that aliases StructureMap types.
 * This provides the ergonomic `User.Selectable` syntax.
 */
export const formatNamespaceAlias = (data: RelationData): string => {
  const { rel, schemaPrefix, tableComment } = data;
  const tableName = `${schemaPrefix}${rel.name}`;

  return `${tableComment}
export namespace ${rel.name} {
  export type Table = StructureMap['${tableName}']['Table'];
  export type Selectable = StructureMap['${tableName}']['Selectable'];
  export type JSONSelectable = StructureMap['${tableName}']['JSONSelectable'];
  export type Whereable = StructureMap['${tableName}']['Whereable'];
  export type Insertable = StructureMap['${tableName}']['Insertable'];
  export type Updatable = StructureMap['${tableName}']['Updatable'];
  export type UniqueIndex = StructureMap['${tableName}']['UniqueIndex'];
  export type Column = StructureMap['${tableName}']['Column'];
  export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
  export type SQLExpression = Table | db.ColumnNames<Updatable | (keyof Updatable)[]> | db.ColumnValues<Updatable> | Whereable | Column | db.ParentColumn | db.GenericSQLExpression;
  export type SQL = SQLExpression | SQLExpression[];
}`;
};

/**
 * Generate SQLExpression type definition for a relation
 *
 * Creates the type used in SQL template literal contexts.
 */
export const formatSQLExpressionType = (data: RelationData): string => {
  const { schemaPrefix, rel } = data;
  const tableName = `${schemaPrefix}${rel.name}`;
  const sanitizedTypeName = sanitizeTypeIdentifier(tableName);

  return `type ${sanitizedTypeName}SQLExpression = '${tableName}' | db.ColumnNames<StructureMap['${tableName}']['Updatable'] | (keyof StructureMap['${tableName}']['Updatable'])[]> | db.ColumnValues<StructureMap['${tableName}']['Updatable']> | StructureMap['${tableName}']['Whereable'] | StructureMap['${tableName}']['Column'] | db.ParentColumn | db.GenericSQLExpression;`;
};

// ============================================================================
// Cross-Table Type Formatters
// ============================================================================

/**
 * Generate cross-table union types for a single schema
 *
 * Creates union types like:
 * - export type Table = User.Table | Post.Table | Comment.Table
 * - export type Selectable = User.Selectable | Post.Selectable | ...
 */
export const formatCrossTableTypes = (tables: Relation[]): string => {
  return `${tables.length === 0 ?
    '\n// `never` rather than `any` types would be more accurate in this no-tables case, but they stop `shortcuts.ts` compiling\n' : ''
  }
export type Table = ${tableMappedUnion(tables, 'Table')};
export type Selectable = ${tableMappedUnion(tables, 'Selectable')};
export type JSONSelectable = ${tableMappedUnion(tables, 'JSONSelectable')};
export type Whereable = ${tableMappedUnion(tables, 'Whereable')};
export type Insertable = ${tableMappedUnion(tables, 'Insertable')};
export type Updatable = ${tableMappedUnion(tables, 'Updatable')};
export type UniqueIndex = ${tableMappedUnion(tables, 'UniqueIndex')};
export type Column = ${tableMappedUnion(tables, 'Column')};

export type AllBaseTables = ${tableMappedArray(tables.filter(rel => rel.type === 'table'), 'Table')};
export type AllForeignTables = ${tableMappedArray(tables.filter(rel => rel.type === 'fdw'), 'Table')};
export type AllViews = ${tableMappedArray(tables.filter(rel => rel.type === 'view'), 'Table')};
export type AllMaterializedViews = ${tableMappedArray(tables.filter(rel => rel.type === 'mview'), 'Table')};
export type AllTablesAndViews = ${tableMappedArray(tables, 'Table')};`;
};

/**
 * Generate ForTable lookup types across all schemas
 *
 * Creates conditional types that map table names to their types:
 * - SelectableForTable<'public.users'> = public.users.Selectable
 */
export const formatCrossSchemaTypesForTables = (allTables: Relation[], unprefixedSchema: string | null): string => {
  return ['Selectable', 'JSONSelectable', 'Whereable', 'Insertable', 'Updatable', 'UniqueIndex', 'Column', 'SQL'].map(thingable => `
export type ${thingable}ForTable<T extends Table> = ${allTables.length === 0 ? 'any' : `{${allTables.map(rel => `
  "${rel.schema === unprefixedSchema ? '' : `${rel.schema}.`}${rel.name}": ${rel.schema === unprefixedSchema ? '' : `${rel.schema}.`}${rel.name}.${thingable};`).join('')}
}[T]`};
`).join('');
};

/**
 * Generate cross-schema union types for multi-schema configs
 *
 * Creates union types that span schemas:
 * - export type Table = public.Table | admin.Table | auth.Table
 */
export const formatCrossSchemaTypesForSchemas = (schemas: string[]): string => {
  return `
export type Schema = ${schemas.map(s => `'${s}'`).join(' | ')};
export type Table = ${schemaMappedUnion(schemas, 'Table')};
export type Selectable = ${schemaMappedUnion(schemas, 'Selectable')};
export type JSONSelectable = ${schemaMappedUnion(schemas, 'JSONSelectable')};
export type Whereable = ${schemaMappedUnion(schemas, 'Whereable')};
export type Insertable = ${schemaMappedUnion(schemas, 'Insertable')};
export type Updatable = ${schemaMappedUnion(schemas, 'Updatable')};
export type UniqueIndex = ${schemaMappedUnion(schemas, 'UniqueIndex')};
export type Column = ${schemaMappedUnion(schemas, 'Column')};

export type AllSchemas = [${schemas.map(s => `'${s}'`).join(', ')}];
export type AllBaseTables = ${schemaMappedArray(schemas, 'AllBaseTables')};
export type AllForeignTables = ${schemaMappedArray(schemas, 'AllForeignTables')};
export type AllViews = ${schemaMappedArray(schemas, 'AllViews')};
export type AllMaterializedViews = ${schemaMappedArray(schemas, 'AllMaterializedViews')};
export type AllTablesAndViews = ${schemaMappedArray(schemas, 'AllTablesAndViews')};
`;
};
