/* eslint-disable no-useless-escape */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockConfig, createMockRelation, createMockColumn } from './__fixtures__/common-fixtures';
import type { EnumData } from './enums';
import type { Relation } from './introspection';
import {
  transformCustomType,
  quoteIfIllegalIdentifier,
  createColumnDoc,
  getColumnTypeInfo,
} from './typeTransformation';

describe('typeTransformation Module', () => {
  describe('transformCustomType', () => {
    describe('PgMy_type mode', () => {
      it('transforms simple type: my_type → PgMy_type', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMy_type' });
        const result = transformCustomType('my_type', config);
        expect(result).toBe('PgMy_type');
      });

      it('transforms with underscores: user_status → PgUser_status', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMy_type' });
        const result = transformCustomType('user_status', config);
        expect(result).toBe('PgUser_status');
      });

      it('replaces non-word characters with underscores: my-type → PgMy_type', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMy_type' });
        const result = transformCustomType('my-type', config);
        expect(result).toBe('PgMy_type');
      });

      it('handles multiple special chars: my.custom-type → PgMy_custom_type', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMy_type' });
        const result = transformCustomType('my.custom-type', config);
        expect(result).toBe('PgMy_custom_type');
      });
    });

    describe('my_type mode', () => {
      it('removes special characters: my-type → mytype', () => {
        const config = createMockConfig({ customTypesTransform: 'my_type' });
        const result = transformCustomType('my-type', config);
        expect(result).toBe('mytype');
      });

      it('preserves underscores (word chars): user_status → user_status', () => {
        const config = createMockConfig({ customTypesTransform: 'my_type' });
        const result = transformCustomType('user_status', config);
        expect(result).toBe('user_status');  // \W only removes non-word chars, underscores are word chars
      });

      it('preserves alphanumeric: mytype123 → mytype123', () => {
        const config = createMockConfig({ customTypesTransform: 'my_type' });
        const result = transformCustomType('mytype123', config);
        expect(result).toBe('mytype123');
      });
    });

    describe('PgMyType mode (PascalCase)', () => {
      it('transforms snake_case to PascalCase: my_type → PgMyType', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMyType' });
        const result = transformCustomType('my_type', config);
        expect(result).toBe('PgMyType');
      });

      it('handles multiple underscores: user_role_status → PgUserRoleStatus', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMyType' });
        const result = transformCustomType('user_role_status', config);
        expect(result).toBe('PgUserRoleStatus');
      });

      it('converts hyphens and uppercases after underscore: my-type → PgMytype', () => {
        const config = createMockConfig({ customTypesTransform: 'PgMyType' });
        const result = transformCustomType('my-type', config);
        expect(result).toBe('PgMytype');  // Only first char after _ is uppercased
      });
    });

    describe('Custom function mode', () => {
      it('applies custom function transformation', () => {
        const customFn = (name: string) => `Custom_${name.toUpperCase()}`;
        const config = createMockConfig({ customTypesTransform: customFn });
        const result = transformCustomType('my_type', config);
        expect(result).toBe('Custom_MY_TYPE');
      });

      it('passes original type name to function', () => {
        const customFn = vi.fn((name: string) => `Prefix${name}`);
        const config = createMockConfig({ customTypesTransform: customFn });
        transformCustomType('test_type', config);
        expect(customFn).toHaveBeenCalledWith('test_type');
      });
    });
  });

  describe('quoteIfIllegalIdentifier', () => {
    describe('Legal identifiers (no quotes)', () => {
      it('does not quote simple name: id → id', () => {
        expect(quoteIfIllegalIdentifier('id')).toBe('id');
      });

      it('does not quote snake_case: user_name → user_name', () => {
        expect(quoteIfIllegalIdentifier('user_name')).toBe('user_name');
      });

      it('does not quote PascalCase: UserName → UserName', () => {
        expect(quoteIfIllegalIdentifier('UserName')).toBe('UserName');
      });

      it('does not quote camelCase: userName → userName', () => {
        expect(quoteIfIllegalIdentifier('userName')).toBe('userName');
      });

      it('does not quote with leading underscore: _private → _private', () => {
        expect(quoteIfIllegalIdentifier('_private')).toBe('_private');
      });

      it('does not quote with dollar sign: $special → $special', () => {
        expect(quoteIfIllegalIdentifier('$special')).toBe('$special');
      });

      it('does not quote with numbers: user123 → user123', () => {
        expect(quoteIfIllegalIdentifier('user123')).toBe('user123');
      });
    });

    describe('Illegal identifiers (requires quotes)', () => {
      it('quotes with dash: user-id → "user-id"', () => {
        expect(quoteIfIllegalIdentifier('user-id')).toBe('"user-id"');
      });

      it('quotes with space: full name → "full name"', () => {
        expect(quoteIfIllegalIdentifier('full name')).toBe('"full name"');
      });

      it('quotes with dot: user.name → "user.name"', () => {
        expect(quoteIfIllegalIdentifier('user.name')).toBe('"user.name"');
      });

      it('quotes starting with number: 123user → "123user"', () => {
        expect(quoteIfIllegalIdentifier('123user')).toBe('"123user"');
      });

      it('quotes with special characters: user@domain → "user@domain"', () => {
        expect(quoteIfIllegalIdentifier('user@domain')).toBe('"user@domain"');
      });
    });
  });

  describe('createColumnDoc', () => {
    let mockConfig: ReturnType<typeof createMockConfig>;
    let mockRelation: Relation;

    beforeEach(() => {
      mockConfig = createMockConfig({ schemaJSDoc: true });
      mockRelation = createMockRelation('users');
    });

    it('returns empty string when schemaJSDoc is false', () => {
      const config = createMockConfig({ schemaJSDoc: false });
      const column = createMockColumn();
      const result = createColumnDoc(config, 'public', mockRelation, column);
      expect(result).toBe('');
    });

    it('generates basic JSDoc for simple column', () => {
      const column = createMockColumn({ column: 'id', udtName: 'int4' });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('/**');
      expect(result).toContain('users.id');
      expect(result).toContain('`int4`');
      expect(result).toContain('*/');
    });

    it('includes schema prefix when not unprefixed schema', () => {
      const config = createMockConfig({ schemaJSDoc: true, unprefixedSchema: 'public' });
      const column = createMockColumn({ column: 'name' });
      const result = createColumnDoc(config, 'auth', mockRelation, column);
      expect(result).toContain('auth.users.name');
    });

    it('omits schema prefix for unprefixed schema', () => {
      const config = createMockConfig({ schemaJSDoc: true, unprefixedSchema: 'public' });
      const column = createMockColumn({ column: 'name' });
      const result = createColumnDoc(config, 'public', mockRelation, column);
      expect(result).toContain('users.name');
      expect(result).not.toContain('public.users.name');
    });

    it('includes NOT NULL status for non-nullable columns', () => {
      const column = createMockColumn({ isNullable: false });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('`NOT NULL`');
    });

    it('includes Nullable status for nullable columns', () => {
      const column = createMockColumn({ isNullable: true });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('Nullable');
    });

    it('includes default value when present', () => {
      const column = createMockColumn({ hasDefault: true, defaultValue: "nextval('users_id_seq')" });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain("default: `nextval('users_id_seq')`");
    });

    it('indicates identity column when hasDefault but no defaultValue', () => {
      const column = createMockColumn({ hasDefault: true, defaultValue: null });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('identity column');
    });

    it('indicates no default when hasDefault is false', () => {
      const column = createMockColumn({ hasDefault: false, defaultValue: null });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('no default');
    });

    it('labels generated columns', () => {
      const column = createMockColumn({ isGenerated: true });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('Generated column');
    });

    it('labels materialized view columns', () => {
      const mviewRelation = createMockRelation('user_stats', { type: 'mview' });
      const column = createMockColumn();
      const result = createColumnDoc(mockConfig, 'public', mviewRelation, column);
      expect(result).toContain('Materialized view column');
    });

    it('includes domain information when domainName is present', () => {
      const column = createMockColumn({ domainName: 'email_address', udtName: 'varchar' });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('`email_address`');
      expect(result).toContain('base type: `varchar`');
    });

    it('includes column description when present', () => {
      const column = createMockColumn({ description: 'User email address' });
      const result = createColumnDoc(mockConfig, 'public', mockRelation, column);
      expect(result).toContain('User email address');
    });
  });

  describe('getColumnTypeInfo', () => {
    let mockConfig: ReturnType<typeof createMockConfig>;
    let mockEnums: EnumData;
    let mockRelation: Relation;

    beforeEach(() => {
      mockConfig = createMockConfig();
      mockEnums = {};
      mockRelation = createMockRelation('users');
    });

    describe('Basic column info', () => {
      it('returns correct column name and quoted version', () => {
        const column = createMockColumn({ column: 'user_id' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.columnName).toBe('user_id');
        expect(result.possiblyQuotedColumn).toBe('user_id');
      });

      it('quotes illegal identifier names', () => {
        const column = createMockColumn({ column: 'user-id' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.columnName).toBe('user-id');
        expect(result.possiblyQuotedColumn).toBe('"user-id"');
      });

      it('preserves PostgreSQL type information', () => {
        const column = createMockColumn({ udtName: 'varchar', isNullable: true, hasDefault: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.pgType).toBe('varchar');
        expect(result.isNullable).toBe(true);
        expect(result.hasDefault).toBe(false);
      });
    });

    describe('Type mappings', () => {
      it('generates all 5 type contexts for standard column', () => {
        const column = createMockColumn({ udtName: 'int4' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.rawSelectableType).toBe('number');
        expect(result.rawJSONSelectableType).toBe('number');
        expect(result.rawWhereableType).toBe('number');
        expect(result.rawInsertableType).toBe('number');
        expect(result.rawUpdatableType).toBe('number');
      });

      it('sets final types equal to raw types for known types', () => {
        const column = createMockColumn({ udtName: 'text' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.selectableType).toBe('string');
        expect(result.selectableType).toBe(result.rawSelectableType);
      });
    });

    describe('Insertability logic', () => {
      it('marks non-nullable without default as required insertable', () => {
        const column = createMockColumn({ isNullable: false, hasDefault: false, isGenerated: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(true);
        expect(result.insertablyOptional).toBe(false);
      });

      it('marks nullable without default as optional insertable', () => {
        const column = createMockColumn({ isNullable: true, hasDefault: false, isGenerated: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(true);
        expect(result.insertablyOptional).toBe(true);
      });

      it('marks column with default as optional insertable', () => {
        const column = createMockColumn({ isNullable: false, hasDefault: true, isGenerated: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(true);
        expect(result.insertablyOptional).toBe(true);
      });

      it('marks generated column as non-insertable', () => {
        const column = createMockColumn({ isGenerated: true });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(false);
      });

      it('marks column as non-insertable for non-insertable relation', () => {
        const viewRelation = createMockRelation('user_view', { insertable: false });
        const column = createMockColumn();
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, viewRelation, 'public');
        expect(result.isInsertable).toBe(false);
      });
    });

    describe('Updatability logic', () => {
      it('marks non-generated column as updatable', () => {
        const column = createMockColumn({ isGenerated: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isUpdatable).toBe(true);
      });

      it('marks generated column as non-updatable', () => {
        const column = createMockColumn({ isGenerated: true });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.isUpdatable).toBe(false);
      });

      it('marks column as non-updatable for non-insertable relation', () => {
        const viewRelation = createMockRelation('user_view', { insertable: false });
        const column = createMockColumn();
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, viewRelation, 'public');
        expect(result.isUpdatable).toBe(false);
      });
    });

    describe('Column options override', () => {
      it('respects columnOptions[\"*\"][\"col\"]: {insert: \"excluded\"}', () => {
        const config = createMockConfig({
          columnOptions: {
            '*': {
              created_at: { insert: 'excluded' }
            }
          }
        });
        const column = createMockColumn({ column: 'created_at' });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(false);
      });

      it('respects columnOptions[\"table\"][\"col\"]: {insert: \"optional\"}', () => {
        const config = createMockConfig({
          columnOptions: {
            'users': {
              email: { insert: 'optional' }
            }
          }
        });
        const column = createMockColumn({ column: 'email', isNullable: false, hasDefault: false });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.insertablyOptional).toBe(true);
      });

      it('respects columnOptions update: \"excluded\"', () => {
        const config = createMockConfig({
          columnOptions: {
            'users': {
              created_at: { update: 'excluded' }
            }
          }
        });
        const column = createMockColumn({ column: 'created_at' });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.isUpdatable).toBe(false);
      });

      it('table-specific options override wildcard options', () => {
        const config = createMockConfig({
          columnOptions: {
            '*': {
              id: { insert: 'excluded' }
            },
            'users': {
              id: { insert: 'optional' }  // This should win
            }
          }
        });
        const column = createMockColumn({ column: 'id', isNullable: false, hasDefault: false });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.isInsertable).toBe(true);
        expect(result.insertablyOptional).toBe(true);
      });
    });

    describe('Custom type handling', () => {
      it('creates custom type info for unknown type', () => {
        const column = createMockColumn({ udtName: 'my_custom_type' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.customTypeInfo).not.toBeNull();
        expect(result.customTypeInfo?.name).toBe('my_custom_type');
        expect(result.customTypeInfo?.prefixedName).toBe('PgMy_custom_type');
        expect(result.customTypeInfo?.baseType).toBe('any');
      });

      it('uses custom type for all type variants', () => {
        const column = createMockColumn({ udtName: 'my_custom_type' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.selectableType).toBe('c.PgMy_custom_type');
        expect(result.JSONSelectableType).toBe('c.PgMy_custom_type');
        expect(result.whereableType).toBe('c.PgMy_custom_type');
        expect(result.insertableType).toBe('c.PgMy_custom_type');
        expect(result.updatableType).toBe('c.PgMy_custom_type');
      });

      it('handles domain types (case 3)', () => {
        const column = createMockColumn({ udtName: 'varchar', domainName: 'email_address' });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.customTypeInfo).not.toBeNull();
        expect(result.customTypeInfo?.name).toBe('email_address');
        expect(result.customTypeInfo?.prefixedName).toBe('PgEmail_address');
        expect(result.customTypeInfo?.baseType).toBe('string');  // varchar maps to string
      });

      it('applies custom transform function to custom types', () => {
        const config = createMockConfig({
          customTypesTransform: 'PgMyType'
        });
        const column = createMockColumn({ udtName: 'my_type' });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.customTypeInfo?.prefixedName).toBe('PgMyType');
        expect(result.selectableType).toBe('c.PgMyType');
      });
    });

    describe('Type modifiers', () => {
      it('sets orNull for nullable columns', () => {
        const column = createMockColumn({ isNullable: true });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.orNull).toBe(' | null');
      });

      it('sets empty orNull for non-nullable columns', () => {
        const column = createMockColumn({ isNullable: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.orNull).toBe('');
      });

      it('sets orDefault for columns with default', () => {
        const column = createMockColumn({ hasDefault: true });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.orDefault).toBe(' | db.DefaultType');
      });

      it('sets orDefault for nullable columns', () => {
        const column = createMockColumn({ isNullable: true, hasDefault: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.orDefault).toBe(' | db.DefaultType');
      });

      it('sets empty orDefault for required columns without default', () => {
        const column = createMockColumn({ isNullable: false, hasDefault: false });
        const result = getColumnTypeInfo(column, mockConfig, mockEnums, mockRelation, 'public');
        expect(result.orDefault).toBe('');
      });
    });

    describe('Schema prefix handling', () => {
      it('uses empty prefix for unprefixed schema', () => {
        const config = createMockConfig({
          unprefixedSchema: 'public',
          columnOptions: {
            'users': {
              email: { insert: 'optional' }
            }
          }
        });
        const column = createMockColumn({ column: 'email' });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.insertablyOptional).toBe(true);
      });

      it('includes schema prefix for non-unprefixed schema', () => {
        const config = createMockConfig({
          unprefixedSchema: 'public',
          columnOptions: {
            'auth.users': {
              email: { insert: 'optional' }
            }
          }
        });
        const column = createMockColumn({ column: 'email' });
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'auth');
        expect(result.insertablyOptional).toBe(true);
      });
    });

    describe('Column documentation', () => {
      it('includes JSDoc when schemaJSDoc is enabled', () => {
        const config = createMockConfig({ schemaJSDoc: true });
        const column = createMockColumn();
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.columnDoc).toContain('/**');
        expect(result.columnDoc).toContain('*/');
      });

      it('omits JSDoc when schemaJSDoc is disabled', () => {
        const config = createMockConfig({ schemaJSDoc: false });
        const column = createMockColumn();
        const result = getColumnTypeInfo(column, config, mockEnums, mockRelation, 'public');
        expect(result.columnDoc).toBe('');
      });
    });
  });
});
