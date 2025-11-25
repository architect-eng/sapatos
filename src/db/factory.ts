
/**
 * Factory function for creating a typed Sapatos database interface.
 *
 * This module provides `createSapatosDb<Schema>()` which returns all Sapatos
 * functionality typed to the provided schema, enabling cross-project type imports
 * in NX monorepos.
 */

import type * as pg from 'pg';
import * as conditions from './conditions';
import {
  sql,
  SQLFragment,
  Parameter,
  param,
  raw,
  cols,
  vals,
  parent,
  Default,
  self,
  all,
  type AllType,
  type SQL,
  type Queryable,
  type DefaultType,
  type SelfType,
  type GenericSQLExpression,
  type JSONValue,
  type JSONObject,
  type JSONArray,
  type Int8String,
  type NumericString,
  ColumnNames,
  ColumnValues,
  ParentColumn,
  DangerousRawString,
  strict,
  toBuffer,
} from './core';
import type {
  BaseSchema,
  TableNames,
  InsertableFor,
  UpdatableFor,
  WhereableFor,
  ColumnFor,
  UniqueIndexFor,
  ColumnsOptionFor,
  ExtrasOptionFor,
  ReturningOptionsFor,
  ReturningTypeFor,
  LateralOptionFor,
  SelectOptionsFor,
  SelectReturnTypeFor,
  UpsertOptionsFor,
  UpsertReturnTypeFor,
  TruncateOpts,
  SQLFor,
} from './schema-types';
import {
  insert,
  upsert,
  update,
  deletes,
  truncate,
  select,
  selectOne,
  selectExactlyOne,
  count,
  sum,
  avg,
  min,
  max,
  Constraint,
  constraint,
  NotExactlyOneError,
  SelectResultMode,
  doNothing,
} from './shortcuts';
import {
  transaction,
  serializable,
  repeatableRead,
  readCommitted,
  serializableRO,
  repeatableReadRO,
  readCommittedRO,
  serializableRODeferrable,
  IsolationLevel,
  type TxnClient,
  type TxnClientForSerializable,
  type TxnClientForRepeatableRead,
  type TxnClientForReadCommitted,
  type TxnClientForSerializableRO,
  type TxnClientForRepeatableReadRO,
  type TxnClientForReadCommittedRO,
  type TxnClientForSerializableRODeferrable,
} from './transaction';
import { NoInfer } from './utils';

// ============================================================================
// Schema-typed function interfaces
// These interfaces define the type signatures for shortcuts that are
// parameterized by the schema type S, constraining table names and types.
// ============================================================================

/**
 * Schema-typed insert function
 */
interface InsertFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined>(
    table: T,
    values: InsertableFor<S, T>,
    options?: ReturningOptionsFor<S, T, C, E>
  ): SQLFragment<ReturningTypeFor<S, T, C, E>>;

  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined>(
    table: T,
    values: InsertableFor<S, T>[],
    options?: ReturningOptionsFor<S, T, C, E>
  ): SQLFragment<ReturningTypeFor<S, T, C, E>[]>;
}

/**
 * Schema-typed select function
 */
interface SelectFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   L extends LateralOptionFor<S, T, C, E> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   A extends string = never>(
    table: T,
    where: WhereableFor<S, T> | SQLFragment<unknown> | AllType,
    options?: SelectOptionsFor<S, T, C, L, E, A>
  ): SQLFragment<SelectReturnTypeFor<S, T, C, L, E>[]>;
}

/**
 * Schema-typed selectOne function
 */
interface SelectOneFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   L extends LateralOptionFor<S, T, C, E> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   A extends string = never>(
    table: T,
    where: WhereableFor<S, T> | SQLFragment<unknown> | AllType,
    options?: SelectOptionsFor<S, T, C, L, E, A>
  ): SQLFragment<SelectReturnTypeFor<S, T, C, L, E> | undefined>;
}

/**
 * Schema-typed selectExactlyOne function
 */
interface SelectExactlyOneFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   L extends LateralOptionFor<S, T, C, E> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   A extends string = never>(
    table: T,
    where: WhereableFor<S, T> | SQLFragment<unknown> | AllType,
    options?: SelectOptionsFor<S, T, C, L, E, A>
  ): SQLFragment<SelectReturnTypeFor<S, T, C, L, E>>;
}

/**
 * Schema-typed update function
 */
interface UpdateFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined>(
    table: T,
    values: UpdatableFor<S, T>,
    where: WhereableFor<S, T> | SQLFragment<unknown>,
    options?: ReturningOptionsFor<S, T, C, E>
  ): SQLFragment<ReturningTypeFor<S, T, C, E>[]>;
}

/**
 * Schema-typed deletes function
 */
interface DeletesFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined>(
    table: T,
    where: WhereableFor<S, T> | SQLFragment<unknown>,
    options?: ReturningOptionsFor<S, T, C, E>
  ): SQLFragment<ReturningTypeFor<S, T, C, E>[]>;
}

/**
 * Schema-typed Constraint class wrapper interface
 */
interface ConstraintClassFor<S extends BaseSchema> {
  new <T extends TableNames<S>>(value: UniqueIndexFor<S, T>): { value: UniqueIndexFor<S, T> };
}

/**
 * Schema-typed constraint function
 */
interface ConstraintFnFor<S extends BaseSchema> {
  <T extends TableNames<S>>(value: UniqueIndexFor<S, T>): { value: UniqueIndexFor<S, T> };
}

/**
 * Schema-typed upsert function
 */
interface UpsertFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   UC extends ColumnFor<S, T> | ColumnFor<S, T>[] | undefined = undefined,
   RA extends 'suppress' | undefined = undefined>(
    table: T,
    values: InsertableFor<S, T>,
    conflictTarget: { value: UniqueIndexFor<S, T> } | ColumnFor<S, T> | ColumnFor<S, T>[],
    options?: UpsertOptionsFor<S, T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnTypeFor<S, T, C, E, RA> | (UC extends never[] ? undefined : never)>;

  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   UC extends ColumnFor<S, T> | ColumnFor<S, T>[] | undefined = undefined,
   RA extends 'suppress' | undefined = undefined>(
    table: T,
    values: InsertableFor<S, T>[],
    conflictTarget: { value: UniqueIndexFor<S, T> } | ColumnFor<S, T> | ColumnFor<S, T>[],
    options?: UpsertOptionsFor<S, T, C, E, UC, RA>
  ): SQLFragment<UpsertReturnTypeFor<S, T, C, E, RA>[] | (UC extends never[] ? undefined : never)>;
}

/**
 * Schema-typed truncate function
 */
interface TruncateFn<S extends BaseSchema> {
  (table: TableNames<S> | TableNames<S>[], ...opts: TruncateOpts[]): SQLFragment<undefined>;
}

/**
 * Schema-typed aggregate function (count, sum, avg, min, max)
 */
interface AggregateFn<S extends BaseSchema> {
  <T extends TableNames<S>,
   C extends ColumnsOptionFor<S, T> = undefined,
   L extends LateralOptionFor<S, T, C, E> = undefined,
   E extends ExtrasOptionFor<S, T> = undefined,
   A extends string = never>(
    table: T,
    where: WhereableFor<S, T> | SQLFragment<unknown> | AllType,
    options?: SelectOptionsFor<S, T, C, L, E, A>
  ): SQLFragment<number>;
}

/**
 * Schema-typed sql function
 * Constrains interpolations to valid schema types
 */
interface SqlFn<S extends BaseSchema> {
  <Interpolations = SQLFor<S>,
   RunResult = pg.QueryResult['rows'],
   C = never>(
    literals: TemplateStringsArray,
    ...expressions: NoInfer<Interpolations>[]
  ): SQLFragment<RunResult, C>;
}

/**
 * Create a typed database interface for the given schema.
 *
 * This factory function returns all Sapatos functionality (shortcuts, conditions,
 * transactions, etc.) typed to the provided schema. This enables cross-project
 * type imports in NX monorepos.
 *
 * @example
 * ```typescript
 * import { createSapatosDb } from '@architect-eng/sapatos/db';
 * import type { Schema } from './sapatos/schema';
 *
 * export const db = createSapatosDb<Schema>();
 * export type { Schema };
 *
 * // In consumer project:
 * import { db } from '@myorg/db-migrations';
 * const { insert, select, eq } = db;
 *
 * const user = await insert('users', { name: 'test' }).run(pool);
 * const users = await select('users', { id: db.eq(1) }).run(pool);
 * ```
 *
 * @example Schema composition
 * ```typescript
 * import type { SchemaA } from '@myorg/project-a';
 * import type { SchemaB } from '@myorg/project-b';
 *
 * // Compose multiple schemas via intersection
 * const db = createSapatosDb<SchemaA & SchemaB>();
 * // Can now query tables from both schemas
 * ```
 */
export function createSapatosDb<S extends BaseSchema>() {
  return {
    // Schema-typed sql function (constrains interpolations to valid schema types)
    sql: sql as unknown as SqlFn<S>,

    // Schema-agnostic SQL building primitives
    param,
    raw,
    cols,
    vals,
    parent,

    // Special values
    Default,
    self,
    all,

    // Schema-typed query shortcut functions
    insert: insert as unknown as InsertFn<S>,
    upsert: upsert as unknown as UpsertFn<S>,
    update: update as unknown as UpdateFn<S>,
    deletes: deletes as unknown as DeletesFn<S>,
    truncate: truncate as unknown as TruncateFn<S>,
    select: select as unknown as SelectFn<S>,
    selectOne: selectOne as unknown as SelectOneFn<S>,
    selectExactlyOne: selectExactlyOne as unknown as SelectExactlyOneFn<S>,
    count: count as unknown as AggregateFn<S>,
    sum: sum as unknown as AggregateFn<S>,
    avg: avg as unknown as AggregateFn<S>,
    min: min as unknown as AggregateFn<S>,
    max: max as unknown as AggregateFn<S>,

    // Schema-typed constraint helpers for upsert
    Constraint: Constraint as unknown as ConstraintClassFor<S>,
    constraint: constraint as unknown as ConstraintFnFor<S>,
    doNothing,

    // Conditions (spread for convenience) - schema-agnostic
    ...conditions,

    // Transaction utilities - schema-agnostic
    transaction,
    serializable,
    repeatableRead,
    readCommitted,
    serializableRO,
    repeatableReadRO,
    readCommittedRO,
    serializableRODeferrable,
    IsolationLevel,

    // Error classes and utilities
    NotExactlyOneError,
    SelectResultMode,

    // Type conversion utilities
    strict,
    toBuffer,

    // Classes (for instanceof checks)
    SQLFragment,
    Parameter,
    ColumnNames,
    ColumnValues,
    ParentColumn,
    DangerousRawString,
  } as const;
}

/**
 * Type for the return value of createSapatosDb.
 * Useful for typing variables that hold the db interface.
 */
export type SapatosDb<S extends BaseSchema> = ReturnType<typeof createSapatosDb<S>>;

// Re-export types that consumers might need
export type {
  BaseSchema,
  SQLFragment,
  Parameter,
  Queryable,
  AllType,
  SQL,
  DefaultType,
  SelfType,
  GenericSQLExpression,
  JSONValue,
  JSONObject,
  JSONArray,
  Int8String,
  NumericString,
  TxnClient,
  TxnClientForSerializable,
  TxnClientForRepeatableRead,
  TxnClientForReadCommitted,
  TxnClientForSerializableRO,
  TxnClientForRepeatableReadRO,
  TxnClientForReadCommittedRO,
  TxnClientForSerializableRODeferrable,
};
