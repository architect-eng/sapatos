
/**
 * Schema type definitions for createSapatosDb<Schema>()
 *
 * These types define the structure that generated schemas must satisfy,
 * enabling the factory function to extract table-specific types.
 */

import type {
  SQLFragment,
  ColumnNames,
  ColumnValues,
  ParentColumn,
  GenericSQLExpression,
  AllType,
} from './core';

/**
 * Base interface that all table definitions must satisfy.
 * This is used to constrain the Schema generic parameter.
 */
export interface TableDefinition {
  Table: string;
  Selectable: Record<string, unknown>;
  JSONSelectable: Record<string, unknown>;
  Whereable: Record<string, unknown>;
  Insertable: Record<string, unknown>;
  Updatable: Record<string, unknown>;
  UniqueIndex: string;
  Column: string;
}

/**
 * Base interface for a complete database schema.
 * Generated schemas must satisfy this structure.
 */
export interface BaseSchema {
  tables: Record<string, TableDefinition>;
}

/**
 * Extract the table names from a schema as a union type.
 */
export type TableNames<S extends BaseSchema> = keyof S['tables'] & string;

/**
 * Extract a specific type for a table from the schema.
 */
export type SelectableFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['Selectable'];
export type JSONSelectableFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['JSONSelectable'];
export type WhereableFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['Whereable'];
export type InsertableFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['Insertable'];
export type UpdatableFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['Updatable'];
export type UniqueIndexFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['UniqueIndex'];
export type ColumnFor<S extends BaseSchema, T extends TableNames<S>> = S['tables'][T]['Column'];

// ============================================================================
// Schema-parameterized helper types for factory function interfaces
// ============================================================================

/**
 * Schema-parameterized columns option (for RETURNING clause)
 */
export type ColumnsOptionFor<S extends BaseSchema, T extends TableNames<S>> =
  readonly ColumnFor<S, T>[] | undefined;

/**
 * Schema-parameterized extras option (computed columns in RETURNING)
 */
export type ExtrasOptionFor<S extends BaseSchema, T extends TableNames<S>> =
  Record<string, SQLFragment<unknown> | ColumnFor<S, T>> | undefined;

/**
 * Schema-parameterized returning options
 */
export interface ReturningOptionsFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  E extends ExtrasOptionFor<S, T>
> {
  returning?: C;
  extras?: E;
}

/**
 * Extract result type for extras
 */
export type ExtrasResultFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  E extends Record<string, unknown>
> = {
  [K in keyof E]: E[K] extends SQLFragment<infer R> ? R :
    E[K] extends ColumnFor<S, T> ? JSONSelectableFor<S, T>[E[K] & keyof JSONSelectableFor<S, T>] :
    never;
};

/**
 * Schema-parameterized return type for INSERT/UPDATE/DELETE operations
 */
export type ReturningTypeFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  E extends ExtrasOptionFor<S, T>
> =
  (undefined extends C ? JSONSelectableFor<S, T> :
    C extends readonly ColumnFor<S, T>[] ? Pick<JSONSelectableFor<S, T>, C[number] & keyof JSONSelectableFor<S, T>> :
    never) &
  (undefined extends E ? NonNullable<unknown> :
    E extends Record<string, unknown> ? ExtrasResultFor<S, T, E> :
    never);

// ============================================================================
// Schema-parameterized SQL interpolation types
// ============================================================================

/**
 * Union of all Updatable types in the schema
 */
type AllUpdatables<S extends BaseSchema> = S['tables'][TableNames<S>]['Updatable'];

/**
 * Union of all Whereable types in the schema
 */
type AllWhereables<S extends BaseSchema> = S['tables'][TableNames<S>]['Whereable'];

/**
 * Schema-parameterized SQLExpression type for sql`` interpolations
 */
export type SQLExpressionFor<S extends BaseSchema> =
  | TableNames<S>
  | ColumnNames<AllUpdatables<S> | (keyof AllUpdatables<S>)[]>
  | ColumnValues<AllUpdatables<S> | unknown[]>
  | AllWhereables<S>
  | ParentColumn
  | GenericSQLExpression;

/**
 * Schema-parameterized SQL type (expression or array of expressions)
 */
export type SQLFor<S extends BaseSchema> = SQLExpressionFor<S> | SQLExpressionFor<S>[];

// ============================================================================
// Schema-parameterized SELECT options and return types
// ============================================================================

/**
 * Lateral join option types
 */
type LimitedLateralOptionFor = Record<string, SQLFragment<unknown>> | undefined;
type FullLateralOptionFor = LimitedLateralOptionFor | SQLFragment<unknown>;

export type LateralOptionFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  E extends ExtrasOptionFor<S, T>,
> = undefined extends C
  ? undefined extends E
    ? FullLateralOptionFor
    : LimitedLateralOptionFor
  : LimitedLateralOptionFor;

/**
 * Extract result type from lateral joins
 */
export type LateralResultFor<L extends Record<string, SQLFragment<unknown>>> = {
  [K in keyof L]: L[K] extends SQLFragment<infer R>
    ? (undefined extends R ? NonNullable<R> | null : R)
    : never;
};

/**
 * Order specification for SELECT
 */
export interface OrderSpecFor<S extends BaseSchema, T extends TableNames<S>> {
  by: ColumnFor<S, T> | SQLFragment<unknown>;
  direction: 'ASC' | 'DESC';
  nulls?: 'FIRST' | 'LAST';
}

/**
 * Locking options for SELECT
 * (Note: Also exported from shortcuts.ts - this is an internal copy for schema-types)
 */
interface SelectLockingOptionsFor<A extends string> {
  for: 'UPDATE' | 'NO KEY UPDATE' | 'SHARE' | 'KEY SHARE';
  of?: string | A | (string | A)[];
  wait?: 'NOWAIT' | 'SKIP LOCKED';
}

/**
 * Schema-parameterized SELECT options
 */
export interface SelectOptionsFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  L extends LateralOptionFor<S, T, C, E>,
  E extends ExtrasOptionFor<S, T>,
  A extends string
> {
  distinct?: boolean | ColumnFor<S, T> | ColumnFor<S, T>[] | SQLFragment<unknown>;
  order?: OrderSpecFor<S, T> | OrderSpecFor<S, T>[];
  limit?: number;
  offset?: number;
  withTies?: boolean;
  columns?: C;
  extras?: E;
  groupBy?: ColumnFor<S, T> | ColumnFor<S, T>[] | SQLFragment<unknown>;
  having?: WhereableFor<S, T> | SQLFragment<unknown>;
  lateral?: L;
  alias?: A;
  lock?: SelectLockingOptionsFor<A> | SelectLockingOptionsFor<A>[];
}

/**
 * Schema-parameterized SELECT return type
 */
export type SelectReturnTypeFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  L extends LateralOptionFor<S, T, C, E>,
  E extends ExtrasOptionFor<S, T>
> =
  (undefined extends C ? JSONSelectableFor<S, T> :
    C extends readonly ColumnFor<S, T>[] ? Pick<JSONSelectableFor<S, T>, C[number] & keyof JSONSelectableFor<S, T>> :
    never) &
  (undefined extends E ? NonNullable<unknown> :
    E extends Record<string, unknown> ? ExtrasResultFor<S, T, E> :
    never) &
  (undefined extends L ? NonNullable<unknown> :
    L extends SQLFragment<infer LR> ? LR :
    L extends Record<string, SQLFragment<unknown>> ? LateralResultFor<L> :
    never);

// ============================================================================
// Schema-parameterized UPSERT types
// ============================================================================

/**
 * Upsert action indicator
 * (Note: Also exported from shortcuts.ts - this is an internal copy for schema-types)
 */
interface UpsertActionType {
  $action: 'INSERT' | 'UPDATE';
}

/**
 * Schema-parameterized upsert options
 */
export interface UpsertOptionsFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  E extends ExtrasOptionFor<S, T>,
  UC extends ColumnFor<S, T> | ColumnFor<S, T>[] | undefined,
  RA extends 'suppress' | undefined
> extends ReturningOptionsFor<S, T, C, E> {
  updateValues?: UpdatableFor<S, T>;
  updateColumns?: UC;
  noNullUpdateColumns?: ColumnFor<S, T> | ColumnFor<S, T>[] | AllType;
  reportAction?: RA;
}

/**
 * Schema-parameterized upsert return type
 */
export type UpsertReturnTypeFor<
  S extends BaseSchema,
  T extends TableNames<S>,
  C extends ColumnsOptionFor<S, T>,
  E extends ExtrasOptionFor<S, T>,
  RA extends 'suppress' | undefined
> = ReturningTypeFor<S, T, C, E> & (undefined extends RA ? UpsertActionType : NonNullable<unknown>);

// ============================================================================
// Schema-parameterized TRUNCATE types
// ============================================================================

export type TruncateIdentityOpts = 'CONTINUE IDENTITY' | 'RESTART IDENTITY';
export type TruncateForeignKeyOpts = 'RESTRICT' | 'CASCADE';
export type TruncateOpts = TruncateIdentityOpts | TruncateForeignKeyOpts;
