
/**
 * Schema type definitions for createSapatosDb<Schema>()
 *
 * These types define the structure that generated schemas must satisfy,
 * enabling the factory function to extract table-specific types.
 */

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
