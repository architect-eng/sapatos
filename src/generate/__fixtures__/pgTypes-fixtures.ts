/**
 * Type contexts used in testing PostgreSQL to TypeScript type mappings.
 */
export const typeContexts = ['Selectable', 'JSONSelectable', 'Insertable', 'Updatable', 'Whereable'] as const;

/**
 * PostgreSQL type categories for testing.
 */
export const postgresTypes = {
  // Primitive types that map to basic TypeScript types
  primitives: ['int2', 'int4', 'float4', 'float8', 'text', 'varchar', 'char', 'bpchar', 'bool', 'uuid', 'citext', 'inet', 'oid'] as const,

  // Special types with context-dependent behavior
  special: ['int8', 'numeric', 'date', 'timestamp', 'timestamptz', 'time', 'timetz', 'bytea'] as const,

  // Array types (underscore prefix)
  arrays: ['_int2', '_int4', '_float4', '_text', '_bool', '_jsonb'] as const,

  // Range types
  ranges: ['int4range', 'int8range', 'numrange', 'tsrange', 'tstzrange', 'daterange'] as const,

  // JSON types
  json: ['json', 'jsonb'] as const,

  // Unknown/custom types
  unknown: ['my_custom_type', 'weird_type', 'domain_type'] as const,
};

/**
 * Expected TypeScript type mappings for different contexts.
 */
export const expectedMappings = {
  Selectable: {
    int4: 'number',
    int8: 'db.Int8String',
    text: 'string',
    bool: 'boolean',
    json: 'db.JSONValue',
    date: 'Date',
    timestamp: 'Date',
    _int4: 'number[]',
    int4range: 'db.NumberRangeString',
  },
  JSONSelectable: {
    int4: 'number',
    int8: 'db.Int8String',
    text: 'string',
    bool: 'boolean',
    json: 'db.JSONValue',
    date: 'db.DateString',
    timestamp: 'db.TimestampString',
    _int4: 'number[]',
    int4range: 'db.NumberRangeString',
  },
  Insertable: {
    int4: 'number',
    int8: 'number | db.Int8String | bigint',
    text: 'string',
    bool: 'boolean',
    json: 'db.JSONValue',
    date: 'db.DateString | Date',
    timestamp: 'db.TimestampString | Date',
    _int4: 'number[]',
  },
};

/**
 * Test enum registry for enum type testing.
 */
export const testEnumRegistry = {
  user_role: true,
  status_type: true,
  priority_level: true,
};
