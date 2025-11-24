

import * as pg from 'pg';


/**
 * Represents a database relation (table, view, materialized view, or foreign table)
 */
export interface Relation {
  schema: string;
  name: string;
  type: 'table' | 'view' | 'fdw' | 'mview';
  insertable: boolean;
}

interface RelationRow {
  schema: string;
  name: string;
  lname: string;
  type: 'table' | 'view' | 'fdw' | 'mview';
  insertable: boolean;
}

/**
 * Represents a column's metadata from database introspection
 */
export interface ColumnRow {
  column: string;
  isNullable: boolean;
  isGenerated: boolean;
  hasDefault: boolean;
  defaultValue: string | null;
  udtName: string;
  domainName: string | null;
  description: string | null;
}

/**
 * Represents a unique index on a table
 */
export interface UniqueIndexRow {
  indexname: string;
}

interface EnumRow {
  schema: string;
  name: string;
  value: string;
}

/**
 * Map of enum type names to their possible values
 */
export type EnumData = { [k: string]: string[] };

/**
 * Handles PostgreSQL introspection queries for tables, views, and columns
 */
export class PostgresIntrospector {
  constructor(
    private queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>
  ) {}

  /**
   * Get all relations (tables, views, materialized views, foreign tables) in a schema
   */
  async getRelationsInSchema(schemaName: string): Promise<Relation[]> {
    const { rows } = await this.queryFn({
      text: `
        SELECT $1 as schema
        , table_name AS name
        , lower(table_name) AS lname  -- using a case-insensitive sort, but you can't order by a function in a UNION query
        , CASE table_type WHEN 'VIEW' THEN 'view' WHEN 'FOREIGN' THEN 'fdw' ELSE 'table' END AS type
        , CASE WHEN is_insertable_into = 'YES' THEN true ELSE false END AS insertable
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_type != 'LOCAL TEMPORARY'

        UNION ALL

        SELECT $1 as schema
        , matviewname AS name
        , lower(matviewname) AS lname
        , 'mview'::text AS type
        , false AS insertable
        FROM pg_catalog.pg_matviews
        WHERE schemaname = $1

        ORDER BY lname, name
      `,
      values: [schemaName]
    }) as pg.QueryResult<RelationRow>;

    return rows;
  }

  /**
   * Get all columns for a given relation (table/view) with their metadata
   */
  async getColumnsForRelation(rel: Relation, schemaName: string): Promise<ColumnRow[]> {
    const { rows } = await this.queryFn({
      text:
        rel.type === 'mview'
          ? `
          SELECT
            a.attname AS "column"
          , a.attnotnull = 'f' AS "isNullable"
          , true AS "isGenerated"  -- true, to reflect that we can't write to materalized views
          , false AS "hasDefault"   -- irrelevant, since we can't write to materalized views
          , NULL as "defaultValue"
          , CASE WHEN t1.typtype = 'd' THEN t2.typname ELSE t1.typname END AS "udtName"
          , CASE WHEN t1.typtype = 'd' THEN t1.typname ELSE NULL END AS "domainName"
          , d.description AS "description"
          FROM pg_catalog.pg_class c
          LEFT JOIN pg_catalog.pg_attribute a ON c.oid = a.attrelid
          LEFT JOIN pg_catalog.pg_namespace n ON c.relnamespace = n.oid
          LEFT JOIN pg_catalog.pg_type t1 ON t1.oid = a.atttypid
          LEFT JOIN pg_catalog.pg_type t2 ON t2.oid = t1.typbasetype
          LEFT JOIN pg_catalog.pg_description d ON d.objoid = c.oid AND d.objsubid = a.attnum
          WHERE c.relkind = 'm' AND a.attnum >= 1 AND c.relname = $1 AND n.nspname = $2
          ORDER BY "column"`
          : `
          SELECT
            column_name AS "column"
          , is_nullable = 'YES' AS "isNullable"
          , is_generated = 'ALWAYS' OR identity_generation = 'ALWAYS' AS "isGenerated"
          , column_default IS NOT NULL OR identity_generation = 'BY DEFAULT' AS "hasDefault"
          , column_default::text AS "defaultValue"
          , udt_name AS "udtName"
          , domain_name AS "domainName"
          , d.description AS "description"
          FROM information_schema.columns AS c
          LEFT JOIN pg_catalog.pg_namespace ns ON ns.nspname = c.table_schema
          LEFT JOIN pg_catalog.pg_class cl ON cl.relkind = 'r' AND cl.relname = c.table_name AND cl.relnamespace = ns.oid
          LEFT JOIN pg_catalog.pg_description d ON d.objoid = cl.oid AND d.objsubid = c.ordinal_position
          WHERE c.table_name = $1 AND c.table_schema = $2
          ORDER BY "column"`,
      values: [rel.name, schemaName],
    }) as pg.QueryResult<ColumnRow>;

    return rows;
  }

  /**
   * Get all unique indexes for a given relation
   */
  async getUniqueIndexesForRelation(rel: Relation, schemaName: string): Promise<UniqueIndexRow[]> {
    const result = await this.queryFn({
      text: `
        SELECT DISTINCT i.indexname
        FROM pg_catalog.pg_indexes i
        JOIN pg_catalog.pg_class c ON c.relname = i.indexname
        JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid AND idx.indisunique
        WHERE i.tablename = $1 AND i.schemaname = $2
        ORDER BY i.indexname`,
      values: [rel.name, schemaName]
    }) as pg.QueryResult<UniqueIndexRow>;

    return result.rows;
  }
}

/**
 * Handles PostgreSQL introspection queries for enum types
 */
export class EnumIntrospector {
  constructor(private queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>) {}

  /**
   * Get all enum types and their values for a given schema
   */
  async getEnumsForSchema(schemaName: string): Promise<EnumData> {
    const { rows } = await this.queryFn({
      text: `
        SELECT
          n.nspname AS schema
        , t.typname AS name
        , e.enumlabel AS value
        FROM pg_catalog.pg_type t
        JOIN pg_catalog.pg_enum e ON t.oid = e.enumtypid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        ORDER BY t.typname ASC, e.enumlabel ASC`,
      values: [schemaName],
    }) as pg.QueryResult<EnumRow>;

    const enums: EnumData = rows.reduce<EnumData>((memo, row) => {
      memo[row.name] = memo[row.name] ?? [];
      memo[row.name]?.push(row.value);
      return memo;
    }, {});

    return enums;
  }
}
