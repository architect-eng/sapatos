import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CompleteConfig } from './config';
import { tsForConfig } from './tsOutput';

// Shared mock state
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockQueryImpl: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mockEndImpl: any;

// Mock pg module
vi.mock('pg', () => {
  return {
    Pool: vi.fn().mockImplementation(function(this: unknown) {
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        query: (...args: unknown[]) => mockQueryImpl(...args),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        end: (...args: unknown[]) => mockEndImpl(...args),
      };
    }),
  };
});

describe('tsForConfig - Module Augmentation', () => {
  beforeEach(() => {
    mockQueryImpl = vi.fn();
    mockEndImpl = vi.fn().mockResolvedValue(undefined);
  });

  const createMockConfig = (overrides: Partial<CompleteConfig> = {}): CompleteConfig => ({
    db: {
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
    },
    outDir: './test-output',
    outExt: '.d.ts',
    schemas: {
      public: { include: '*', exclude: [] },
    },
    unprefixedSchema: 'public',
    columnOptions: {},
    customTypesTransform: 'PgMy_type',
    schemaJSDoc: false,
    progressListener: false,
    warningListener: false,
    debugListener: false,
    customJSONParsingForLargeNumbers: false,
    ...overrides,
  });

  const mockTableQuery = (tables: Array<{ name: string; type: 'table' | 'view' | 'fdw' | 'mview'; insertable: boolean }>) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockQueryImpl.mockResolvedValueOnce({
      rows: tables.map(t => ({
        schema: 'public',
        name: t.name,
        lname: t.name.toLowerCase(),
        type: t.type,
        insertable: t.insertable,
      })),
    });
  };

  const mockColumnsQuery = (columns: Array<{
    column: string;
    udtName: string;
    isNullable: boolean;
    isGenerated: boolean;
    hasDefault: boolean;
    defaultValue: string | null;
    domainName: string | null;
    description: string | null;
  }>) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockQueryImpl.mockResolvedValueOnce({ rows: columns });
  };

  const mockEnumQuery = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockQueryImpl.mockResolvedValueOnce({ rows: [] }); // No enums for simple tests
  };

  const mockUniqueIndexQuery = (indexes: Array<{ indexname: string }>) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mockQueryImpl.mockResolvedValueOnce({ rows: indexes });
  };

  it('generates StructureMap interface augmentation with declare module', async () => {
    const config = createMockConfig();

    // Mock: tables query
    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);

    // Mock: enums query
    mockEnumQuery();

    // Mock: columns query for users
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
      {
        column: 'name',
        udtName: 'text',
        isNullable: false,
        isGenerated: false,
        hasDefault: false,
        defaultValue: null,
        domainName: null,
        description: null,
      },
    ]);

    // Mock: unique indexes query
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify it uses declare module with StructureMap
    expect(ts).toContain("declare module '@architect-eng/sapatos/schema'");
    expect(ts).toContain('interface StructureMap');

    // Verify users table is in StructureMap
    expect(ts).toMatch(/interface StructureMap\s*{[\s\S]*'users':/);
  });

  it('generates all required properties in StructureMap entries', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify all 8 required properties exist in the users entry
    expect(ts).toMatch(/'users':\s*{[\s\S]*Table:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*Selectable:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*JSONSelectable:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*Whereable:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*Insertable:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*Updatable:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*UniqueIndex:/);
    expect(ts).toMatch(/'users':\s*{[\s\S]*Column:/);
  });

  it('generates backward-compatible namespace aliases', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify namespace alias exists
    expect(ts).toContain('export namespace users');

    // Verify namespace exports reference StructureMap
    expect(ts).toMatch(/export namespace users\s*{[\s\S]*export type Table = StructureMap\['users'\]\['Table'\]/);
    expect(ts).toMatch(/export namespace users\s*{[\s\S]*export type Selectable = StructureMap\['users'\]\['Selectable'\]/);
    expect(ts).toMatch(/export namespace users\s*{[\s\S]*export type Insertable = StructureMap\['users'\]\['Insertable'\]/);
  });

  it('generates lookup types using StructureMap indexed access', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify lookup types use StructureMap
    expect(ts).toContain("export type SelectableForTable<T extends Table> = StructureMap[T]['Selectable']");
    expect(ts).toContain("export type InsertableForTable<T extends Table> = StructureMap[T]['Insertable']");
    expect(ts).toContain("export type UpdatableForTable<T extends Table> = StructureMap[T]['Updatable']");
    expect(ts).toContain("export type WhereableForTable<T extends Table> = StructureMap[T]['Whereable']");
    expect(ts).toContain("export type JSONSelectableForTable<T extends Table> = StructureMap[T]['JSONSelectable']");
    expect(ts).toContain("export type ColumnForTable<T extends Table> = StructureMap[T]['Column']");
    expect(ts).toContain("export type UniqueIndexForTable<T extends Table> = StructureMap[T]['UniqueIndex']");
  });

  it('generates union types from StructureMap', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify union types use StructureMap
    expect(ts).toContain('export type Table = keyof StructureMap');
    expect(ts).toContain("export type Selectable = StructureMap[Table]['Selectable']");
    expect(ts).toContain("export type Insertable = StructureMap[Table]['Insertable']");
    expect(ts).toContain("export type Whereable = StructureMap[Table]['Whereable']");
    expect(ts).toContain("export type Updatable = StructureMap[Table]['Updatable']");
    expect(ts).toContain("export type Column = StructureMap[Table]['Column']");
  });

  it('handles custom types in StructureMap entries', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
      {
        column: 'metadata',
        udtName: 'my_custom_type',  // Custom type that will be unknown
        isNullable: true,
        isGenerated: false,
        hasDefault: false,
        defaultValue: null,
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts, customTypeSourceFiles } = await tsForConfig(config, () => {});

    // Verify custom type import
    expect(ts).toMatch(/declare module '@architect-eng\/sapatos\/schema'\s*{[\s\S]*import type \* as c from '@architect-eng\/sapatos\/custom'/);

    // Verify custom type is used in StructureMap
    expect(ts).toContain('c.PgMy_custom_type');

    // Verify custom type file is generated
    expect(customTypeSourceFiles).toHaveProperty('PgMy_custom_type');
  });

  it('handles multi-schema generation with prefixed table names', async () => {
    // Note: This test uses a single schema with schema prefix to verify the prefixing logic
    // Testing true multi-schema with parallel Promise.all requires more sophisticated mocking
    const config = createMockConfig({
      schemas: {
        public: { include: '*', exclude: [] },
      },
      unprefixedSchema: null, // Schema will be prefixed
    });

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify schema prefix is applied when unprefixedSchema is null
    expect(ts).toMatch(/interface StructureMap\s*{[\s\S]*'public\.users':/);

    // Verify namespace alias uses unprefixed table name
    expect(ts).toContain('export namespace users');

    // Verify table name has schema prefix in StructureMap
    expect(ts).toContain("Table: 'public.users'");

    // Verify SQLExpression type uses sanitized schema prefix (dots replaced with underscores)
    expect(ts).toContain("type public_usersSQLExpression");
  });

  it('preserves schema version canary', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify version canary exists
    expect(ts).toContain('export interface schemaVersionCanary');
    expect(ts).toContain('extends db.SchemaVersionCanary');
    expect(ts).toContain('version: 105');
  });

  it('generates proper header comment', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'users', type: 'table', insertable: true }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: false,
        hasDefault: true,
        defaultValue: 'nextval(...)',
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([{ indexname: 'users_pkey' }]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify header
    expect(ts).toContain("CRITICAL: DO NOT EDIT THIS FILE");
    expect(ts).toContain('Sapatos');
  });

  it('handles tables with no insertable or updatable columns', async () => {
    const config = createMockConfig();

    mockTableQuery([{ name: 'readonly_view', type: 'view', insertable: false }]);
    mockEnumQuery();
    mockColumnsQuery([
      {
        column: 'id',
        udtName: 'int4',
        isNullable: false,
        isGenerated: true, // Generated column
        hasDefault: false,
        defaultValue: null,
        domainName: null,
        description: null,
      },
    ]);
    mockUniqueIndexQuery([]);

    const { ts } = await tsForConfig(config, () => {});

    // Verify empty Insertable and Updatable use [key: string]: never
    expect(ts).toMatch(/'readonly_view':[\s\S]*Insertable:\s*{\s*\[key: string\]: never;/);
    expect(ts).toMatch(/'readonly_view':[\s\S]*Updatable:\s*{\s*\[key: string\]: never;/);
  });
});
