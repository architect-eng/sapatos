

import * as pg from 'pg';
import { CompleteConfig } from './config';
import { CustomTypeRegistry } from './customTypes';
import type { EnumData } from './enums';
import {
  PostgresIntrospector,
  type Relation,
  type ColumnRow,
  type UniqueIndexRow
} from './introspection';
import {
  formatStructureMapEntry,
  formatNamespaceAlias,
  formatSQLExpressionType,
  formatCrossTableTypes,
  formatCrossSchemaTypesForTables,
  formatCrossSchemaTypesForSchemas
} from './schemaFormatting';
import {
  getColumnTypeInfo
} from './typeTransformation';

// Re-export Relation for backward compatibility
export type { Relation } from './introspection';

/**
 * Get all relations in a schema (wrapper for backward compatibility)
 */
export const relationsInSchema = async (
  schemaName: string,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>
): Promise<Relation[]> => {
  const introspector = new PostgresIntrospector(queryFn);
  return introspector.getRelationsInSchema(schemaName);
};

/**
 * Get columns for a relation (internal helper using introspector)
 */
const columnsForRelation = async (
  rel: Relation,
  schemaName: string,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>
): Promise<ColumnRow[]> => {
  const introspector = new PostgresIntrospector(queryFn);
  return introspector.getColumnsForRelation(rel, schemaName);
};

export const definitionForRelationInSchema = async (
  rel: Relation,
  schemaName: string,
  enums: EnumData,
  registry: CustomTypeRegistry,
  config: CompleteConfig,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>,
) => {
  const
    rows = await columnsForRelation(rel, schemaName, queryFn),
    selectables: string[] = [],
    JSONSelectables: string[] = [],
    whereables: string[] = [],
    insertables: string[] = [],
    updatables: string[] = [];

  rows.forEach((row: ColumnRow) => {
    // Get structured type information for this column
    const typeInfo = getColumnTypeInfo(row, config, enums, rel, schemaName);

    // Register custom type if needed
    if (typeInfo.customTypeInfo) {
      registry.register(
        typeInfo.customTypeInfo.name,
        typeInfo.customTypeInfo.prefixedName,
        typeInfo.customTypeInfo.baseType
      );
    }

    // Build type strings
    const {
      columnDoc,
      possiblyQuotedColumn,
      selectableType,
      JSONSelectableType,
      whereableType,
      insertableType,
      updatableType,
      orNull,
      orDefault,
      isInsertable,
      isUpdatable,
      insertablyOptional
    } = typeInfo;

    selectables.push(`${columnDoc}${possiblyQuotedColumn}: ${selectableType}${orNull};`);
    JSONSelectables.push(`${columnDoc}${possiblyQuotedColumn}: ${JSONSelectableType}${orNull};`);

    const basicWhereableTypes = `${whereableType} | db.Parameter<${whereableType}> | db.SQLFragment | db.ParentColumn<any>`;
    whereables.push(`${columnDoc}${possiblyQuotedColumn}?: ${basicWhereableTypes} | db.SQLFragment<any, ${basicWhereableTypes}>;`);

    const insertableTypes = `${insertableType} | db.Parameter<${insertableType}>${orNull}${orDefault} | db.SQLFragment`;
    if (isInsertable) insertables.push(`${columnDoc}${possiblyQuotedColumn}${insertablyOptional ? '?' : ''}: ${insertableTypes};`);

    const updatableTypes = `${updatableType} | db.Parameter<${updatableType}>${orNull}${orDefault} | db.SQLFragment`;
    if (isUpdatable) updatables.push(`${columnDoc}${possiblyQuotedColumn}?: ${updatableTypes} | db.SQLFragment<any, ${updatableTypes}>;`);
  });

  const introspector = new PostgresIntrospector(queryFn);
  const uniqueIndexes = await introspector.getUniqueIndexesForRelation(rel, schemaName);

  const
    schemaPrefix = schemaName === config.unprefixedSchema ? '' : `${schemaName}.`,
    friendlyRelTypes: Record<Relation['type'], string> = {
      table: 'Table',
      fdw: 'Foreign table',
      view: 'View',
      mview: 'Materialized view',
    },
    friendlyRelType = friendlyRelTypes[rel.type],
    tableComment = config.schemaJSDoc ? `
/**
 * **${schemaPrefix}${rel.name}**
 * - ${friendlyRelType} in database
 */` : ``,
    tableDef = `${tableComment}
export namespace ${rel.name} {
  export type Table = '${schemaPrefix}${rel.name}';
  export interface Selectable {
    ${selectables.join('\n    ')}
  }
  export interface JSONSelectable {
    ${JSONSelectables.join('\n    ')}
  }
  export interface Whereable {
    ${whereables.join('\n    ')}
  }
  export interface Insertable {
    ${insertables.length > 0 ? insertables.join('\n    ') : `[key: string]: never;`}
  }
  export interface Updatable {
    ${updatables.length > 0 ? updatables.join('\n    ') : `[key: string]: never;`}
  }
  export type UniqueIndex = ${uniqueIndexes.length > 0 ?
        uniqueIndexes.map((ui: UniqueIndexRow) => `'${ui.indexname}'`).join(' | ') :
        'never'};
  export type Column = keyof Selectable;
  export type OnlyCols<T extends readonly Column[]> = Pick<Selectable, T[number]>;
  export type SQLExpression = Table | db.ColumnNames<Updatable | (keyof Updatable)[]> | db.ColumnValues<Updatable> | Whereable | Column | db.ParentColumn | db.GenericSQLExpression;
  export type SQL = SQLExpression | SQLExpression[];
}`;
  return tableDef;
};

/**
 * Interface containing structured data for a table/view relation
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

/**
 * Collects structured data for a relation without formatting it
 */
export const dataForRelationInSchema = async (
  rel: Relation,
  schemaName: string,
  enums: EnumData,
  registry: CustomTypeRegistry,
  config: CompleteConfig,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>,
): Promise<RelationData> => {
  const
    rows = await columnsForRelation(rel, schemaName, queryFn),
    selectables: string[] = [],
    JSONSelectables: string[] = [],
    whereables: string[] = [],
    insertables: string[] = [],
    updatables: string[] = [],
    columns: string[] = [];

  rows.forEach((row: ColumnRow) => {
    const { column, udtName } = row;

    // Skip rows with missing required column metadata
    if (!column || !udtName) {
      return;
    }

    // Get structured type information for this column
    const typeInfo = getColumnTypeInfo(row, config, enums, rel, schemaName);

    // Register custom type if needed
    if (typeInfo.customTypeInfo) {
      registry.register(
        typeInfo.customTypeInfo.name,
        typeInfo.customTypeInfo.prefixedName,
        typeInfo.customTypeInfo.baseType
      );
    }

    // Build type strings
    const {
      columnDoc,
      possiblyQuotedColumn,
      selectableType,
      JSONSelectableType,
      whereableType,
      insertableType,
      updatableType,
      orNull,
      orDefault,
      isInsertable,
      isUpdatable,
      insertablyOptional
    } = typeInfo;

    columns.push(column);
    selectables.push(`${columnDoc}${possiblyQuotedColumn}: ${selectableType}${orNull};`);
    JSONSelectables.push(`${columnDoc}${possiblyQuotedColumn}: ${JSONSelectableType}${orNull};`);

    const basicWhereableTypes = `${whereableType} | db.Parameter<${whereableType}> | db.SQLFragment | db.ParentColumn<any>`;
    whereables.push(`${columnDoc}${possiblyQuotedColumn}?: ${basicWhereableTypes} | db.SQLFragment<any, ${basicWhereableTypes}>;`);

    const insertableTypes = `${insertableType} | db.Parameter<${insertableType}>${orNull}${orDefault} | db.SQLFragment`;
    if (isInsertable) insertables.push(`${columnDoc}${possiblyQuotedColumn}${insertablyOptional ? '?' : ''}: ${insertableTypes};`);

    const updatableTypes = `${updatableType} | db.Parameter<${updatableType}>${orNull}${orDefault} | db.SQLFragment`;
    if (isUpdatable) updatables.push(`${columnDoc}${possiblyQuotedColumn}?: ${updatableTypes} | db.SQLFragment<any, ${updatableTypes}>;`);
  });

  const introspector = new PostgresIntrospector(queryFn);
  const uniqueIndexes = await introspector.getUniqueIndexesForRelation(rel, schemaName);

  const
    schemaPrefix = schemaName === config.unprefixedSchema ? '' : `${schemaName}.`,
    friendlyRelTypes: Record<Relation['type'], string> = {
      table: 'Table',
      fdw: 'Foreign table',
      view: 'View',
      mview: 'Materialized view',
    },
    friendlyRelType = friendlyRelTypes[rel.type],
    tableComment = config.schemaJSDoc ? `
/**
 * **${schemaPrefix}${rel.name}**
 * - ${friendlyRelType} in database
 */` : ``;

  return {
    rel,
    schemaName,
    schemaPrefix,
    selectables,
    JSONSelectables,
    whereables,
    insertables,
    updatables,
    uniqueIndexes,
    columns,
    friendlyRelType,
    tableComment,
  };
};

/**
 * Generate StructureMap entry for a relation
 * Re-exported from schemaFormatting module
 */
export const structureMapEntryForRelation = formatStructureMapEntry;

/**
 * Generate namespace alias for a relation (for backward compatibility)
 * Re-exported from schemaFormatting module
 */
export const namespaceAliasForRelation = formatNamespaceAlias;

/**
 * Generate SQLExpression type definition for a relation
 * Re-exported from schemaFormatting module
 */
export const sqlExpressionTypeForRelation = formatSQLExpressionType;

/**
 * Generate cross-table union types for a single schema
 * Re-exported from schemaFormatting module
 */
export const crossTableTypesForTables = formatCrossTableTypes;

/**
 * Generate ForTable lookup types across all schemas
 * Re-exported from schemaFormatting module
 */
export const crossSchemaTypesForAllTables = formatCrossSchemaTypesForTables;

/**
 * Generate cross-schema union types for multi-schema configs
 * Re-exported from schemaFormatting module
 */
export const crossSchemaTypesForSchemas = formatCrossSchemaTypesForSchemas;
