

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
  getColumnTypeInfo,
  quoteIfIllegalIdentifier
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
 */
export const structureMapEntryForRelation = (data: RelationData): string => {
  const { rel, schemaPrefix, selectables, JSONSelectables, whereables, insertables, updatables, uniqueIndexes, columns } = data;
  const tableName = `${schemaPrefix}${rel.name}`;
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
      SQL: ${tableName}SQLExpression;
    };`;
};

/**
 * Generate namespace alias for a relation (for backward compatibility)
 */
export const namespaceAliasForRelation = (data: RelationData): string => {
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
 */
export const sqlExpressionTypeForRelation = (data: RelationData): string => {
  const { schemaPrefix, rel } = data;
  const tableName = `${schemaPrefix}${rel.name}`;

  return `type ${tableName}SQLExpression = '${tableName}' | db.ColumnNames<StructureMap['${tableName}']['Updatable'] | (keyof StructureMap['${tableName}']['Updatable'])[]> | db.ColumnValues<StructureMap['${tableName}']['Updatable']> | StructureMap['${tableName}']['Whereable'] | StructureMap['${tableName}']['Column'] | db.ParentColumn | db.GenericSQLExpression;`;
};

const
  tableMappedUnion = (arr: Relation[], suffix: string) =>
    arr.length === 0 ? 'never' : arr.map(rel => `${rel.name}.${suffix}`).join(' | '),
  tableMappedArray = (arr: Relation[], suffix: string) =>
    '[' + arr.map(rel => `${rel.name}.${suffix}`).join(', ') + ']';

export const crossTableTypesForTables = (tables: Relation[]) => `${tables.length === 0 ?
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

export const crossSchemaTypesForAllTables = (allTables: Relation[], unprefixedSchema: string | null) =>
  ['Selectable', 'JSONSelectable', 'Whereable', 'Insertable', 'Updatable', 'UniqueIndex', 'Column', 'SQL'].map(thingable => `
export type ${thingable}ForTable<T extends Table> = ${allTables.length === 0 ? 'any' : `{${allTables.map(rel => `
  "${rel.schema === unprefixedSchema ? '' : `${rel.schema}.`}${rel.name}": ${rel.schema === unprefixedSchema ? '' : `${rel.schema}.`}${rel.name}.${thingable};`).join('')}
}[T]`};
`).join('');

const
  schemaMappedUnion = (arr: string[], suffix: string) =>
    arr.length === 0 ? 'any' : arr.map(s => `${s}.${suffix}`).join(' | '),
  schemaMappedArray = (arr: string[], suffix: string) =>
    '[' + arr.map(s => `...${s}.${suffix}`).join(', ') + ']';

export const crossSchemaTypesForSchemas = (schemas: string[]) => `
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
