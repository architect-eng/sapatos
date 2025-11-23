

import * as pg from 'pg';


export type EnumData = { [k: string]: string[] };

export const enumDataForSchema = async (schemaName: string, queryFn: (q: pg.QueryConfig) => Promise<pg.QueryResult>) => {
  const
    { rows } = await queryFn({
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
    }),

    enums: EnumData = rows.reduce((memo, row) => {
      memo[row.name] = memo[row.name] ?? [];
      memo[row.name].push(row.value);
      return memo;
    }, {});

  return enums;
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
