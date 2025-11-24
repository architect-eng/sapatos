/**
 * Custom Types Module
 *
 * Handles registration and tracking of custom PostgreSQL types that need
 * TypeScript type definitions generated. This includes:
 * - Unknown PostgreSQL types (mapped to 'any' by default)
 * - Domain types (PostgreSQL custom types with constraints)
 * - User-defined types
 *
 * Extracted from typeTransformation.ts and tsOutput.ts to make custom type
 * handling explicit and testable.
 */

/**
 * Map of custom type names to their base TypeScript types
 * - Key: Prefixed custom type name (e.g., 'PgMy_type')
 * - Value: Base TypeScript type ('any', 'number', 'string', etc.)
 */
export interface CustomTypes {
  [name: string]: string;  // any, or TS type for domain's base type
}

/**
 * Manages registration of custom PostgreSQL types
 * Encapsulates the side effect of tracking custom types during schema introspection
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
  getRegisteredTypes(): CustomTypes {
    return Object.fromEntries(this.types);
  }

  /**
   * Check if a type is already registered
   */
  has(prefixedName: string): boolean {
    return this.types.has(prefixedName);
  }
}
