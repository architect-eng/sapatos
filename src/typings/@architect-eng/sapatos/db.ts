
// This file provides stub augmentation for the StructureMap interface
// It allows the runtime code to compile without generated schema files
// by providing a placeholder table definition.

/* eslint-disable @typescript-eslint/no-explicit-any */

// Re-export everything from the actual db module
export * from '../../../db';

// Augment the StructureMap with string index signature to allow any table name
// when no generated schema exists
declare module '../../../db/core' {
  interface StructureMap {
    // String index signature allows any table name to be used
    // This will be narrowed by actual generated schemas
    [tableName: string]: {
      Table: string;
      Selectable: Record<string, any>;
      JSONSelectable: Record<string, any>;
      Whereable: Record<string, any>;
      Insertable: Record<string, any>;
      Updatable: Record<string, any>;
      UniqueIndex: string;
      Column: string;
      SQL: any;
    };
  }
}
