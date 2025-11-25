
/**
 * Factory function for creating a typed Sapatos database interface.
 *
 * This module provides `createSapatosDb<Schema>()` which returns all Sapatos
 * functionality typed to the provided schema, enabling cross-project type imports
 * in NX monorepos.
 */

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
import type { BaseSchema } from './schema-types';
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
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function createSapatosDb<_S extends BaseSchema>() {
  // The shortcut functions already use generic constraints like `T extends Table`,
  // which are resolved at the call site. Since we're returning the same functions,
  // the type inference will work correctly when users call them with table names
  // that exist in their Schema.
  //
  // The Schema type parameter here mainly serves as documentation and enables
  // future enhancements where we might want to add runtime validation or
  // schema-specific type narrowing.

  return {
    // SQL building primitives
    sql,
    param,
    raw,
    cols,
    vals,
    parent,

    // Special values
    Default,
    self,
    all,

    // Query shortcut functions
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

    // Constraint helper for upsert
    Constraint,
    constraint,
    doNothing,

    // Conditions (spread for convenience)
    ...conditions,

    // Transaction utilities
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
