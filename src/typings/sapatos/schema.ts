

// this file exists only to suppress type errors when compiling the files in src/db

/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any */
export interface Updatable { [k: string]: any }
export interface Whereable { [k: string]: any }
export interface Insertable { [k: string]: any }
export type Table = string;
export type Column = string;
export type JSONSelectableForTable<_T extends Table = Table> = { [k: string]: any };
export type SelectableForTable<_T extends Table = Table> = { [k: string]: any };
export type WhereableForTable<_T extends Table = Table> = { [k: string]: any };
export type InsertableForTable<_T extends Table = Table> = { [k: string]: any };
export type UpdatableForTable<_T extends Table = Table> = { [k: string]: any };
export type ColumnForTable<_T extends Table = Table> = string;
export type UniqueIndexForTable<_T extends Table = Table> = string;
export type SQLForTable<_T extends Table = Table> = any;
