/**
 * Type Transformation Module
 *
 * Handles the transformation of PostgreSQL types to TypeScript types.
 * This module is responsible for:
 * - Mapping PostgreSQL column types to TypeScript types
 * - Determining column insertability, updatability, and nullability
 * - Managing custom type registration
 * - Providing structured type information (NOT string generation)
 *
 * Extracted from tables.ts to improve testability and reduce duplication.
 */

import type { CompleteConfig } from './config';
import type { EnumData } from './enums';
import type { Relation, ColumnRow } from './introspection';
import { tsTypeForPgType } from './pgTypes';

/**
 * Structured information about a column's TypeScript types
 * This is a data structure, not a formatted string.
 */
export interface ColumnTypeInfo {
  // Column identification
  columnName: string;
  possiblyQuotedColumn: string;

  // PostgreSQL metadata
  pgType: string;
  isNullable: boolean;
  isGenerated: boolean;
  hasDefault: boolean;
  domainName: string | null;

  // TypeScript type mappings (before custom type transformation)
  rawSelectableType: string;
  rawJSONSelectableType: string;
  rawWhereableType: string;
  rawInsertableType: string;
  rawUpdatableType: string;

  // Final TypeScript types (after custom type transformation)
  selectableType: string;
  JSONSelectableType: string;
  whereableType: string;
  insertableType: string;
  updatableType: string;

  // Behavior flags
  isInsertable: boolean;
  isUpdatable: boolean;
  insertablyOptional: boolean;

  // Type modifiers for string generation
  orNull: string;  // ' | null' or ''
  orDefault: string;  // ' | db.DefaultType' or ''

  // Custom type information (if applicable)
  customTypeInfo: {
    name: string;  // Original custom type name
    prefixedName: string;  // Transformed name (e.g., 'PgMy_type')
    baseType: string;  // Base type to register ('any' or known udt type)
  } | null;

  // Documentation
  columnDoc: string;  // JSDoc comment for the column
}

/**
 * Manages registration of custom PostgreSQL types
 * Encapsulates the side effect of tracking custom types
 */
export class CustomTypeRegistry {
  private types: Map<string, string> = new Map();

  /**
   * Register a custom type and return its prefixed reference
   * @param _name - Original custom type name (not used, kept for API clarity)
   * @param prefixedName - Transformed name (e.g., 'PgMy_type')
   * @param baseType - Base type to register
   * @returns The reference to use (e.g., 'c.PgMy_type')
   */
  register(_name: string, prefixedName: string, baseType: string): string {
    this.types.set(prefixedName, baseType);
    return `c.${prefixedName}`;
  }

  /**
   * Get all registered custom types
   * @returns Object mapping prefixed names to base types
   */
  getRegisteredTypes(): Record<string, string> {
    return Object.fromEntries(this.types);
  }

  /**
   * Check if a type is already registered
   */
  has(prefixedName: string): boolean {
    return this.types.has(prefixedName);
  }
}

/**
 * Transform a custom type name according to configuration
 * This function applies the naming convention specified in config.customTypesTransform
 *
 * @param customType - Original PostgreSQL type name
 * @param config - Complete configuration
 * @returns Transformed type name (e.g., 'PgMy_type')
 */
export const transformCustomType = (customType: string, config: CompleteConfig): string => {
  const
    ctt = config.customTypesTransform,
    underscoredType = customType.replace(/\W+/g, '_'),
    legalisedType = customType.replace(/\W+/g, '');

  return ctt === 'my_type' ? legalisedType :
    ctt === 'PgMyType' ? ('Pg_' + legalisedType).replace(/_[^_]/g, m => m.charAt(1).toUpperCase()) :
      ctt === 'PgMy_type' ? 'Pg' + underscoredType.charAt(0).toUpperCase() + underscoredType.slice(1) :
        ctt(customType);
};

/**
 * Quote identifier if it contains illegal characters for TypeScript
 * @param identifier - Column name
 * @returns Quoted or unquoted identifier
 */
export const quoteIfIllegalIdentifier = (identifier: string): string => {
  // note: we'll redundantly quote a bunch of non-ASCII characters like this
  return identifier.match(/^[a-zA-Z_$][0-9a-zA-Z_$]*$/) ? identifier : `"${identifier}"`;
};

/**
 * Create JSDoc comment for a column (if enabled in config)
 * @param config - Complete configuration
 * @param schemaName - Schema name
 * @param rel - Relation (table/view)
 * @param columnDetails - Column metadata from database
 * @returns JSDoc comment string or empty string
 */
export const createColumnDoc = (
  config: CompleteConfig,
  schemaName: string,
  rel: Relation,
  columnDetails: ColumnRow
): string => {
  if (!config.schemaJSDoc) return '';

  const
    schemaPrefix = schemaName === config.unprefixedSchema ? '' : `${schemaName}.`,
    { column,
      isGenerated,
      isNullable,
      hasDefault,
      defaultValue,
      udtName,
      domainName,
      description,
    } = columnDetails;

  const domainText = domainName !== null
    ? `\`${domainName}\` (base type: \`${udtName}\`)`
    : `\`${udtName}\``;

  const descriptionText = description !== null
    ? `\n    *\n    * ${description}`
    : '';

  const detailsText = rel.type === 'mview'
    ? 'Materialized view column'
    : isGenerated
      ? 'Generated column'
      : `${isNullable ? 'Nullable' : '`NOT NULL`'}, ${hasDefault && defaultValue === null ? 'identity column' : hasDefault && defaultValue !== null ? `default: \`${defaultValue}\`` : 'no default'}`;

  const doc = `/**
    * **${schemaPrefix}${rel.name}.${column}**${descriptionText}
    * - ${domainText} in database
    * - ${detailsText}
    */
    `;
  return doc;
};

/**
 * Get structured type information for a database column
 * This is a pure function with NO side effects.
 *
 * @param column - Column metadata from database introspection
 * @param config - Complete configuration
 * @param enums - Enum data for the schema
 * @param relation - The relation (table/view) this column belongs to
 * @param schemaName - Schema name
 * @returns Structured column type information
 */
export const getColumnTypeInfo = (
  column: ColumnRow,
  config: CompleteConfig,
  enums: EnumData,
  relation: Relation,
  schemaName: string
): ColumnTypeInfo => {
  const { column: columnName, isGenerated, isNullable, hasDefault, udtName, domainName } = column;

  // Map PostgreSQL types to TypeScript types
  const
    rawSelectableType = tsTypeForPgType(udtName, enums, 'Selectable', config),
    rawJSONSelectableType = tsTypeForPgType(udtName, enums, 'JSONSelectable', config),
    rawWhereableType = tsTypeForPgType(udtName, enums, 'Whereable', config),
    rawInsertableType = tsTypeForPgType(udtName, enums, 'Insertable', config),
    rawUpdatableType = tsTypeForPgType(udtName, enums, 'Updatable', config);

  // Resolve column options from config
  const
    schemaPrefix = config.unprefixedSchema === schemaName ? '' : `${schemaName}.`,
    prefixedRelName = schemaPrefix + relation.name,
    columnOptions =
      (config.columnOptions[prefixedRelName]?.[columnName]) ??
      (config.columnOptions["*"]?.[columnName]);

  // Determine column behavior
  const
    isInsertable = relation.insertable && !isGenerated && columnOptions?.insert !== 'excluded',
    isUpdatable = relation.insertable && !isGenerated && columnOptions?.update !== 'excluded',
    insertablyOptional = (isNullable || hasDefault || columnOptions?.insert === 'optional');

  // Type modifiers
  const
    orNull = isNullable ? ' | null' : '',
    orDefault = (isNullable || hasDefault) ? ' | db.DefaultType' : '';

  // Handle custom types
  // 4 cases:
  //   1. null domain, known udt        <-- standard case
  //   2. null domain, unknown udt      <-- custom type:       create type file, with placeholder 'any'
  //   3. non-null domain, known udt    <-- alias type:        create type file, with udt-based placeholder
  //   4. non-null domain, unknown udt  <-- alias custom type: create type file, with placeholder 'any'
  let customTypeInfo: ColumnTypeInfo['customTypeInfo'] = null;
  let selectableType = rawSelectableType;
  let JSONSelectableType = rawJSONSelectableType;
  let whereableType = rawWhereableType;
  let insertableType = rawInsertableType;
  let updatableType = rawUpdatableType;

  if (rawSelectableType === 'any' || domainName !== null) {  // cases 2, 3, 4
    const
      customTypeName = domainName !== null ? domainName : udtName,
      prefixedCustomType = transformCustomType(customTypeName, config);

    customTypeInfo = {
      name: customTypeName,
      prefixedName: prefixedCustomType,
      baseType: rawSelectableType
    };

    // All type variants use the custom type
    selectableType = JSONSelectableType = whereableType = insertableType = updatableType =
      `c.${prefixedCustomType}`;
  }

  // Generate column documentation
  const columnDoc = createColumnDoc(config, schemaName, relation, column);

  return {
    columnName,
    possiblyQuotedColumn: quoteIfIllegalIdentifier(columnName),
    pgType: udtName,
    isNullable,
    isGenerated,
    hasDefault,
    domainName,
    rawSelectableType,
    rawJSONSelectableType,
    rawWhereableType,
    rawInsertableType,
    rawUpdatableType,
    selectableType,
    JSONSelectableType,
    whereableType,
    insertableType,
    updatableType,
    isInsertable,
    isUpdatable,
    insertablyOptional,
    orNull,
    orDefault,
    customTypeInfo,
    columnDoc
  };
};
