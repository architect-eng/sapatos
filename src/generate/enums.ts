

import * as pg from 'pg';
import { EnumIntrospector, type EnumData } from './introspection';

// Re-export EnumData for backward compatibility
export type { EnumData } from './introspection';

/**
 * Get enum data for a schema (wrapper for backward compatibility)
 */
export const enumDataForSchema = async (
  schemaName: string,
  queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>
): Promise<EnumData> => {
  const introspector = new EnumIntrospector(queryFn);
  return introspector.getEnumsForSchema(schemaName);
};

export const enumTypesForEnumData = (enums: EnumData) => {
  const types = Object.keys(enums)
    .map(name => {
      const values = enums[name];
      if (values === undefined) return ''; // TypeScript safety check
      return `
export type ${name} = ${values.map(v => `'${v}'`).join(' | ')};
export namespace every {
  export type ${name} = [${values.map(v => `'${v}'`).join(', ')}];
}`;
    })
    .join('');

  return types;
};
