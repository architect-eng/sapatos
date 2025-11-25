import { describe, it, expect } from 'vitest';
import { finaliseConfig } from './config';
import type { EnumData } from './enums';
import { tsTypeForPgType, baseTsTypeForBasePgType, type TypeContext } from './pgTypes';

describe('pgTypes.ts', () => {
  const defaultConfig = finaliseConfig({});
  const emptyEnums: EnumData = {};

  describe('tsTypeForPgType', () => {
    describe('basic types', () => {
      it.each([
        ['int2', 'number'],
        ['int4', 'number'],
        ['float4', 'number'],
        ['float8', 'number'],
        ['oid', 'number'],
      ])('should map %s to %s for Selectable', (pgType, expected) => {
        expect(tsTypeForPgType(pgType, emptyEnums, 'Selectable', defaultConfig)).toBe(expected);
      });

      it.each([
        ['bool', 'boolean'],
      ])('should map %s to %s', (pgType, expected) => {
        expect(tsTypeForPgType(pgType, emptyEnums, 'Selectable', defaultConfig)).toBe(expected);
      });

      it.each([
        ['text', 'string'],
        ['varchar', 'string'],
        ['char', 'string'],
        ['bpchar', 'string'],
        ['citext', 'string'],
        ['uuid', 'string'],
        ['inet', 'string'],
        ['name', 'string'],
        ['interval', 'string'],
      ])('should map %s to string', (pgType) => {
        expect(tsTypeForPgType(pgType, emptyEnums, 'Selectable', defaultConfig)).toBe('string');
      });
    });

    describe('date/time types', () => {
      it('should map date to Date for Selectable', () => {
        expect(tsTypeForPgType('date', emptyEnums, 'Selectable', defaultConfig)).toBe('Date');
      });

      it('should map date to db.DateString for JSONSelectable', () => {
        expect(tsTypeForPgType('date', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('db.DateString');
      });

      it('should map date to union for Insertable', () => {
        expect(tsTypeForPgType('date', emptyEnums, 'Insertable', defaultConfig)).toBe('(db.DateString | Date)');
      });

      it('should map timestamp to Date for Selectable', () => {
        expect(tsTypeForPgType('timestamp', emptyEnums, 'Selectable', defaultConfig)).toBe('Date');
      });

      it('should map timestamp to db.TimestampString for JSONSelectable', () => {
        expect(tsTypeForPgType('timestamp', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('db.TimestampString');
      });

      it('should map timestamptz to Date for Selectable', () => {
        expect(tsTypeForPgType('timestamptz', emptyEnums, 'Selectable', defaultConfig)).toBe('Date');
      });

      it('should map timestamptz to db.TimestampTzString for JSONSelectable', () => {
        expect(tsTypeForPgType('timestamptz', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('db.TimestampTzString');
      });

      it('should map time to db.TimeString for all contexts', () => {
        const contexts: TypeContext[] = ['Selectable', 'JSONSelectable', 'Insertable', 'Updatable', 'Whereable'];
        for (const ctx of contexts) {
          expect(tsTypeForPgType('time', emptyEnums, ctx, defaultConfig)).toBe('db.TimeString');
        }
      });

      it('should map timetz to db.TimeTzString for all contexts', () => {
        const contexts: TypeContext[] = ['Selectable', 'JSONSelectable', 'Insertable', 'Updatable', 'Whereable'];
        for (const ctx of contexts) {
          expect(tsTypeForPgType('timetz', emptyEnums, ctx, defaultConfig)).toBe('db.TimeTzString');
        }
      });
    });

    describe('numeric types with precision concerns', () => {
      it('should map int8 to db.Int8String for Selectable', () => {
        expect(tsTypeForPgType('int8', emptyEnums, 'Selectable', defaultConfig)).toBe('db.Int8String');
      });

      it('should map int8 to number for JSONSelectable (default)', () => {
        expect(tsTypeForPgType('int8', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('number');
      });

      it('should map int8 with custom JSON parsing for JSONSelectable', () => {
        const config = finaliseConfig({ customJSONParsingForLargeNumbers: true });
        expect(tsTypeForPgType('int8', emptyEnums, 'JSONSelectable', config)).toBe('(number | db.Int8String)');
      });

      it('should map int8 to union for Insertable', () => {
        expect(tsTypeForPgType('int8', emptyEnums, 'Insertable', defaultConfig)).toBe('(number | db.Int8String | bigint)');
      });

      it('should map numeric to db.NumericString for Selectable', () => {
        expect(tsTypeForPgType('numeric', emptyEnums, 'Selectable', defaultConfig)).toBe('db.NumericString');
      });

      it('should map numeric to number for JSONSelectable (default)', () => {
        expect(tsTypeForPgType('numeric', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('number');
      });

      it('should map numeric with custom JSON parsing for JSONSelectable', () => {
        const config = finaliseConfig({ customJSONParsingForLargeNumbers: true });
        expect(tsTypeForPgType('numeric', emptyEnums, 'JSONSelectable', config)).toBe('(number | db.NumericString)');
      });
    });

    describe('binary and special types', () => {
      it('should map bytea to Buffer for Selectable', () => {
        expect(tsTypeForPgType('bytea', emptyEnums, 'Selectable', defaultConfig)).toBe('Buffer');
      });

      it('should map bytea to db.ByteArrayString for JSONSelectable', () => {
        expect(tsTypeForPgType('bytea', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('db.ByteArrayString');
      });

      it('should map bytea to union for Insertable', () => {
        expect(tsTypeForPgType('bytea', emptyEnums, 'Insertable', defaultConfig)).toBe('(db.ByteArrayString | Buffer)');
      });

      it('should map money to string for Selectable', () => {
        expect(tsTypeForPgType('money', emptyEnums, 'Selectable', defaultConfig)).toBe('string');
      });

      it('should map money to union for Insertable', () => {
        expect(tsTypeForPgType('money', emptyEnums, 'Insertable', defaultConfig)).toBe('(number | string)');
      });

      it('should map json to db.JSONValue', () => {
        expect(tsTypeForPgType('json', emptyEnums, 'Selectable', defaultConfig)).toBe('db.JSONValue');
      });

      it('should map jsonb to db.JSONValue', () => {
        expect(tsTypeForPgType('jsonb', emptyEnums, 'Selectable', defaultConfig)).toBe('db.JSONValue');
      });
    });

    describe('range types', () => {
      it.each([
        ['int4range', 'db.NumberRangeString'],
        ['int8range', 'db.NumberRangeString'],
        ['numrange', 'db.NumberRangeString'],
      ])('should map %s to %s', (pgType, expected) => {
        expect(tsTypeForPgType(pgType, emptyEnums, 'Selectable', defaultConfig)).toBe(expected);
      });

      it.each([
        ['tsrange', 'db.DateRangeString'],
        ['tstzrange', 'db.DateRangeString'],
        ['daterange', 'db.DateRangeString'],
      ])('should map %s to %s', (pgType, expected) => {
        expect(tsTypeForPgType(pgType, emptyEnums, 'Selectable', defaultConfig)).toBe(expected);
      });
    });

    describe('enum types', () => {
      it('should return enum name for known enum types', () => {
        const enums: EnumData = {
          status: ['active', 'inactive', 'pending'],
        };
        expect(tsTypeForPgType('status', enums, 'Selectable', defaultConfig)).toBe('status');
      });

      it('should return any for unknown types', () => {
        expect(tsTypeForPgType('unknown_type', emptyEnums, 'Selectable', defaultConfig)).toBe('any');
      });
    });

    describe('array types', () => {
      it('should handle array of basic types', () => {
        expect(tsTypeForPgType('_int4', emptyEnums, 'Selectable', defaultConfig)).toBe('number[]');
        expect(tsTypeForPgType('_text', emptyEnums, 'Selectable', defaultConfig)).toBe('string[]');
        expect(tsTypeForPgType('_bool', emptyEnums, 'Selectable', defaultConfig)).toBe('boolean[]');
      });

      it('should handle array of enum types', () => {
        const enums: EnumData = {
          status: ['active', 'inactive'],
        };
        expect(tsTypeForPgType('_status', enums, 'Selectable', defaultConfig)).toBe('status[]');
      });

      it('should handle array of date types', () => {
        expect(tsTypeForPgType('_timestamp', emptyEnums, 'Selectable', defaultConfig)).toBe('Date[]');
        expect(tsTypeForPgType('_timestamp', emptyEnums, 'JSONSelectable', defaultConfig)).toBe('db.TimestampString[]');
      });

      it('should return any for unknown array types', () => {
        expect(tsTypeForPgType('_unknown', emptyEnums, 'Selectable', defaultConfig)).toBe('any');
      });
    });
  });

  describe('baseTsTypeForBasePgType', () => {
    it('should return null for unknown types', () => {
      expect(baseTsTypeForBasePgType('custom_type', emptyEnums, 'Selectable', defaultConfig)).toBe(null);
    });

    it('should return enum name for known enums', () => {
      const enums: EnumData = { my_enum: ['a', 'b'] };
      expect(baseTsTypeForBasePgType('my_enum', enums, 'Selectable', defaultConfig)).toBe('my_enum');
    });
  });
});
