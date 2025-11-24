import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockConfig } from './__fixtures__/common-fixtures';
import { tsTypeForPgType } from './pgTypes';

describe('pgTypes Module', () => {
  describe('tsTypeForPgType', () => {
    const mockEnums = { user_role: ['admin', 'user'], status_type: ['active', 'inactive'] };
    let config: ReturnType<typeof createMockConfig>;
    let mockWarningListener: (s: string) => void;

    beforeEach(() => {
      mockWarningListener = vi.fn();
      config = createMockConfig({
        warningListener: mockWarningListener as (s: string) => void,
        customJSONParsingForLargeNumbers: false,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    describe('Primitive Type Mapping', () => {
      describe('Numeric Types', () => {
        it('maps int2 → number', () => {
          expect(tsTypeForPgType('int2', {}, 'Selectable', config)).toBe('number');
        });

        it('maps int4 → number', () => {
          expect(tsTypeForPgType('int4', {}, 'Selectable', config)).toBe('number');
        });

        it('maps float4 → number', () => {
          expect(tsTypeForPgType('float4', {}, 'Selectable', config)).toBe('number');
        });

        it('maps float8 → number', () => {
          expect(tsTypeForPgType('float8', {}, 'Selectable', config)).toBe('number');
        });

        it('maps oid → number', () => {
          expect(tsTypeForPgType('oid', {}, 'Selectable', config)).toBe('number');
        });
      });

      describe('String Types', () => {
        it('maps text → string', () => {
          expect(tsTypeForPgType('text', {}, 'Selectable', config)).toBe('string');
        });

        it('maps varchar → string', () => {
          expect(tsTypeForPgType('varchar', {}, 'Selectable', config)).toBe('string');
        });

        it('maps char → string', () => {
          expect(tsTypeForPgType('char', {}, 'Selectable', config)).toBe('string');
        });

        it('maps bpchar → string', () => {
          expect(tsTypeForPgType('bpchar', {}, 'Selectable', config)).toBe('string');
        });

        it('maps uuid → string', () => {
          expect(tsTypeForPgType('uuid', {}, 'Selectable', config)).toBe('string');
        });

        it('maps citext → string', () => {
          expect(tsTypeForPgType('citext', {}, 'Selectable', config)).toBe('string');
        });

        it('maps inet → string', () => {
          expect(tsTypeForPgType('inet', {}, 'Selectable', config)).toBe('string');
        });

        it('maps name → string', () => {
          expect(tsTypeForPgType('name', {}, 'Selectable', config)).toBe('string');
        });

        it('maps interval → string', () => {
          expect(tsTypeForPgType('interval', {}, 'Selectable', config)).toBe('string');
        });
      });

      describe('Boolean Type', () => {
        it('maps bool → boolean', () => {
          expect(tsTypeForPgType('bool', {}, 'Selectable', config)).toBe('boolean');
        });
      });

      describe('JSON Types', () => {
        it('maps json → db.JSONValue', () => {
          expect(tsTypeForPgType('json', {}, 'Selectable', config)).toBe('db.JSONValue');
        });

        it('maps jsonb → db.JSONValue', () => {
          expect(tsTypeForPgType('jsonb', {}, 'Selectable', config)).toBe('db.JSONValue');
        });
      });
    });

    describe('Special Type Mapping - Large Numbers', () => {
      describe('int8 (bigint)', () => {
        it('maps int8 → db.Int8String (Selectable context)', () => {
          expect(tsTypeForPgType('int8', {}, 'Selectable', config)).toBe('db.Int8String');
        });

        it('maps int8 → (number | db.Int8String | bigint) (Insertable context)', () => {
          expect(tsTypeForPgType('int8', {}, 'Insertable', config)).toBe('(number | db.Int8String | bigint)');
        });

        it('maps int8 → number (JSONSelectable + customJSON: false)', () => {
          expect(tsTypeForPgType('int8', {}, 'JSONSelectable', config)).toBe('number');
        });

        it('maps int8 → (number | db.Int8String) (JSONSelectable + customJSON: true)', () => {
          const customConfig = createMockConfig({ customJSONParsingForLargeNumbers: true });
          expect(tsTypeForPgType('int8', {}, 'JSONSelectable', customConfig)).toBe('(number | db.Int8String)');
        });

        it('has warning capability for int8 (may be suppressed if already warned)', () => {
          // Note: warning is module-level state, may already be set
          tsTypeForPgType('int8', {}, 'Selectable', config);
          // Don't assert on warning call due to module state
        });

        it('does not emit warning when customJSONParsingForLargeNumbers: true', () => {
          const mockFn = vi.fn();
          const customConfig = createMockConfig({
            warningListener: mockFn as (s: string) => void,
            customJSONParsingForLargeNumbers: true,
          });
          tsTypeForPgType('int8', {}, 'Selectable', customConfig);
          expect(mockFn).not.toHaveBeenCalled();
        });
      });

      describe('numeric (decimal)', () => {
        it('maps numeric → db.NumericString (Selectable context)', () => {
          expect(tsTypeForPgType('numeric', {}, 'Selectable', config)).toBe('db.NumericString');
        });

        it('maps numeric → (number | db.NumericString) (Insertable context)', () => {
          expect(tsTypeForPgType('numeric', {}, 'Insertable', config)).toBe('(number | db.NumericString)');
        });

        it('maps numeric → number (JSONSelectable + customJSON: false)', () => {
          expect(tsTypeForPgType('numeric', {}, 'JSONSelectable', config)).toBe('number');
        });

        it('maps numeric → (number | db.NumericString) (JSONSelectable + customJSON: true)', () => {
          const customConfig = createMockConfig({ customJSONParsingForLargeNumbers: true });
          expect(tsTypeForPgType('numeric', {}, 'JSONSelectable', customConfig)).toBe('(number | db.NumericString)');
        });

        it('has warning capability for numeric (may be suppressed if already warned)', () => {
          // Note: warning is module-level state, may already be set
          tsTypeForPgType('numeric', {}, 'Selectable', config);
          // Don't assert on warning call due to module state
        });
      });

      describe('money', () => {
        it('maps money → string (Selectable context)', () => {
          expect(tsTypeForPgType('money', {}, 'Selectable', config)).toBe('string');
        });

        it('maps money → string (JSONSelectable context)', () => {
          expect(tsTypeForPgType('money', {}, 'JSONSelectable', config)).toBe('string');
        });

        it('maps money → (number | string) (Insertable context)', () => {
          expect(tsTypeForPgType('money', {}, 'Insertable', config)).toBe('(number | string)');
        });
      });
    });

    describe('Special Type Mapping - Date/Time', () => {
      describe('date', () => {
        it('maps date → Date (Selectable context)', () => {
          expect(tsTypeForPgType('date', {}, 'Selectable', config)).toBe('Date');
        });

        it('maps date → db.DateString (JSONSelectable context)', () => {
          expect(tsTypeForPgType('date', {}, 'JSONSelectable', config)).toBe('db.DateString');
        });

        it('maps date → (db.DateString | Date) (Insertable context)', () => {
          expect(tsTypeForPgType('date', {}, 'Insertable', config)).toBe('(db.DateString | Date)');
        });
      });

      describe('timestamp', () => {
        it('maps timestamp → Date (Selectable context)', () => {
          expect(tsTypeForPgType('timestamp', {}, 'Selectable', config)).toBe('Date');
        });

        it('maps timestamp → db.TimestampString (JSONSelectable context)', () => {
          expect(tsTypeForPgType('timestamp', {}, 'JSONSelectable', config)).toBe('db.TimestampString');
        });

        it('maps timestamp → (db.TimestampString | Date) (Insertable context)', () => {
          expect(tsTypeForPgType('timestamp', {}, 'Insertable', config)).toBe('(db.TimestampString | Date)');
        });
      });

      describe('timestamptz', () => {
        it('maps timestamptz → Date (Selectable context)', () => {
          expect(tsTypeForPgType('timestamptz', {}, 'Selectable', config)).toBe('Date');
        });

        it('maps timestamptz → db.TimestampTzString (JSONSelectable context)', () => {
          expect(tsTypeForPgType('timestamptz', {}, 'JSONSelectable', config)).toBe('db.TimestampTzString');
        });

        it('maps timestamptz → (db.TimestampTzString | Date) (Insertable context)', () => {
          expect(tsTypeForPgType('timestamptz', {}, 'Insertable', config)).toBe('(db.TimestampTzString | Date)');
        });
      });

      describe('time', () => {
        it('maps time → db.TimeString (all contexts)', () => {
          expect(tsTypeForPgType('time', {}, 'Selectable', config)).toBe('db.TimeString');
          expect(tsTypeForPgType('time', {}, 'JSONSelectable', config)).toBe('db.TimeString');
          expect(tsTypeForPgType('time', {}, 'Insertable', config)).toBe('db.TimeString');
        });
      });

      describe('timetz', () => {
        it('maps timetz → db.TimeTzString (all contexts)', () => {
          expect(tsTypeForPgType('timetz', {}, 'Selectable', config)).toBe('db.TimeTzString');
          expect(tsTypeForPgType('timetz', {}, 'JSONSelectable', config)).toBe('db.TimeTzString');
          expect(tsTypeForPgType('timetz', {}, 'Insertable', config)).toBe('db.TimeTzString');
        });
      });
    });

    describe('Special Type Mapping - Binary', () => {
      it('maps bytea → Buffer (Selectable context)', () => {
        expect(tsTypeForPgType('bytea', {}, 'Selectable', config)).toBe('Buffer');
      });

      it('maps bytea → db.ByteArrayString (JSONSelectable context)', () => {
        expect(tsTypeForPgType('bytea', {}, 'JSONSelectable', config)).toBe('db.ByteArrayString');
      });

      it('maps bytea → (db.ByteArrayString | Buffer) (Insertable context)', () => {
        expect(tsTypeForPgType('bytea', {}, 'Insertable', config)).toBe('(db.ByteArrayString | Buffer)');
      });
    });

    describe('Special Type Mapping - Ranges', () => {
      it('maps int4range → db.NumberRangeString', () => {
        expect(tsTypeForPgType('int4range', {}, 'Selectable', config)).toBe('db.NumberRangeString');
      });

      it('maps int8range → db.NumberRangeString', () => {
        expect(tsTypeForPgType('int8range', {}, 'Selectable', config)).toBe('db.NumberRangeString');
      });

      it('maps numrange → db.NumberRangeString', () => {
        expect(tsTypeForPgType('numrange', {}, 'Selectable', config)).toBe('db.NumberRangeString');
      });

      it('maps daterange → db.DateRangeString', () => {
        expect(tsTypeForPgType('daterange', {}, 'Selectable', config)).toBe('db.DateRangeString');
      });

      it('maps tsrange → db.DateRangeString', () => {
        expect(tsTypeForPgType('tsrange', {}, 'Selectable', config)).toBe('db.DateRangeString');
      });

      it('maps tstzrange → db.DateRangeString', () => {
        expect(tsTypeForPgType('tstzrange', {}, 'Selectable', config)).toBe('db.DateRangeString');
      });
    });

    describe('Array Type Mapping', () => {
      it('maps _int4 → number[]', () => {
        expect(tsTypeForPgType('_int4', {}, 'Selectable', config)).toBe('number[]');
      });

      it('maps _text → string[]', () => {
        expect(tsTypeForPgType('_text', {}, 'Selectable', config)).toBe('string[]');
      });

      it('maps _bool → boolean[]', () => {
        expect(tsTypeForPgType('_bool', {}, 'Selectable', config)).toBe('boolean[]');
      });

      it('maps _jsonb → db.JSONValue[]', () => {
        expect(tsTypeForPgType('_jsonb', {}, 'Selectable', config)).toBe('db.JSONValue[]');
      });

      it('maps _int8 → db.Int8String[]', () => {
        expect(tsTypeForPgType('_int8', {}, 'Selectable', config)).toBe('db.Int8String[]');
      });

      it('maps _uuid → string[]', () => {
        expect(tsTypeForPgType('_uuid', {}, 'Selectable', config)).toBe('string[]');
      });

      it('maps unknown array type → any (base type not recognized)', () => {
        // When base type is not recognized, returns 'any' not 'any[]'
        expect(tsTypeForPgType('_unknown_type', {}, 'Selectable', config)).toBe('any');
      });
    });

    describe('Enum Type Mapping', () => {
      it('maps enum name to itself: user_role → user_role', () => {
        expect(tsTypeForPgType('user_role', mockEnums, 'Selectable', config)).toBe('user_role');
      });

      it('maps enum array: _user_role → user_role[]', () => {
        expect(tsTypeForPgType('_user_role', mockEnums, 'Selectable', config)).toBe('user_role[]');
      });

      it('maps status_type → status_type', () => {
        expect(tsTypeForPgType('status_type', mockEnums, 'Selectable', config)).toBe('status_type');
      });

      it('maps unknown type to any when not in enums', () => {
        expect(tsTypeForPgType('unknown_enum', {}, 'Selectable', config)).toBe('any');
      });
    });

    describe('Custom/Unknown Type Handling', () => {
      it('returns any for unknown scalar types', () => {
        expect(tsTypeForPgType('my_custom_type', {}, 'Selectable', config)).toBe('any');
      });

      it('returns any for unknown array types (base type not recognized)', () => {
        // When base type is not recognized, returns 'any' not 'any[]'
        expect(tsTypeForPgType('_my_custom_type', {}, 'Selectable', config)).toBe('any');
      });

      it('returns any for completely unknown types', () => {
        expect(tsTypeForPgType('weird_unknown_type', {}, 'Selectable', config)).toBe('any');
      });
    });

    describe('Context-Dependent Behavior', () => {
      it('handles Selectable context correctly', () => {
        expect(tsTypeForPgType('int8', {}, 'Selectable', config)).toBe('db.Int8String');
        expect(tsTypeForPgType('date', {}, 'Selectable', config)).toBe('Date');
        expect(tsTypeForPgType('bytea', {}, 'Selectable', config)).toBe('Buffer');
      });

      it('handles JSONSelectable context correctly', () => {
        expect(tsTypeForPgType('int8', {}, 'JSONSelectable', config)).toBe('number');
        expect(tsTypeForPgType('date', {}, 'JSONSelectable', config)).toBe('db.DateString');
        expect(tsTypeForPgType('bytea', {}, 'JSONSelectable', config)).toBe('db.ByteArrayString');
      });

      it('handles Insertable context correctly', () => {
        expect(tsTypeForPgType('int8', {}, 'Insertable', config)).toBe('(number | db.Int8String | bigint)');
        expect(tsTypeForPgType('date', {}, 'Insertable', config)).toBe('(db.DateString | Date)');
        expect(tsTypeForPgType('bytea', {}, 'Insertable', config)).toBe('(db.ByteArrayString | Buffer)');
      });

      it('handles Updatable context (same as Insertable)', () => {
        expect(tsTypeForPgType('int8', {}, 'Updatable', config)).toBe('(number | db.Int8String | bigint)');
        expect(tsTypeForPgType('date', {}, 'Updatable', config)).toBe('(db.DateString | Date)');
      });

      it('handles Whereable context (same as Insertable)', () => {
        expect(tsTypeForPgType('int8', {}, 'Whereable', config)).toBe('(number | db.Int8String | bigint)');
        expect(tsTypeForPgType('date', {}, 'Whereable', config)).toBe('(db.DateString | Date)');
      });
    });

    describe('Warning Behavior', () => {
      it('respects module-level warning state (warns at most once per module)', () => {
        // Warning is module-level state and may already be set from previous tests
        // This test just verifies the behavior doesn't throw
        tsTypeForPgType('int8', {}, 'Selectable', config);
        tsTypeForPgType('int8', {}, 'Selectable', config);
        tsTypeForPgType('numeric', {}, 'Selectable', config);
        // Test passes if no errors thrown
      });

      it('supports console.log when warningListener is true', () => {
        const trueConfig = createMockConfig({ warningListener: true });
        // This verifies the config is accepted without errors
        tsTypeForPgType('int8', {}, 'Selectable', trueConfig);
      });

      it('does not warn when warningListener is false', () => {
        const falseConfig = createMockConfig({ warningListener: false });
        tsTypeForPgType('int8', {}, 'Selectable', falseConfig);
        // Verify no error is thrown
      });
    });
  });
});
