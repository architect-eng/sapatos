/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { describe, it, expect, beforeEach } from 'vitest';
import { CustomTypeRegistry } from './customTypes';

describe('customTypes Module', () => {
  describe('CustomTypeRegistry', () => {
    let registry: CustomTypeRegistry;

    beforeEach(() => {
      registry = new CustomTypeRegistry();
    });

    describe('register', () => {
      it('registers custom type and returns reference: c.PgMy_type', () => {
        const result = registry.register('my_type', 'PgMy_type', 'any');
        expect(result).toBe('c.PgMy_type');
      });

      it('stores prefixed name → base type mapping', () => {
        registry.register('my_type', 'PgMy_type', 'any');
        const types = registry.getRegisteredTypes();
        expect(types).toHaveProperty('PgMy_type', 'any');
      });

      it('accepts original name parameter (for API clarity)', () => {
        // The original name parameter is not used but kept for clarity
        const result = registry.register('original_name', 'PgCustomName', 'string');
        expect(result).toBe('c.PgCustomName');
        expect(registry.has('PgCustomName')).toBe(true);
      });

      it('allows re-registration of same type (last wins)', () => {
        registry.register('type1', 'PgType1', 'any');
        registry.register('type1', 'PgType1', 'string');  // Re-register with different base type
        const types = registry.getRegisteredTypes();
        expect(types.PgType1).toBe('string');  // Last registration wins
      });
    });

    describe('getRegisteredTypes', () => {
      it('returns empty object initially', () => {
        const types = registry.getRegisteredTypes();
        expect(types).toEqual({});
        expect(Object.keys(types).length).toBe(0);
      });

      it('returns all registered types as object', () => {
        registry.register('type1', 'PgType1', 'any');
        registry.register('type2', 'PgType2', 'string');
        registry.register('type3', 'PgType3', 'number');

        const types = registry.getRegisteredTypes();
        expect(types).toEqual({
          PgType1: 'any',
          PgType2: 'string',
          PgType3: 'number'
        });
      });

      it('returns accumulated types after multiple registrations', () => {
        registry.register('t1', 'PgT1', 'any');
        expect(Object.keys(registry.getRegisteredTypes()).length).toBe(1);

        registry.register('t2', 'PgT2', 'string');
        expect(Object.keys(registry.getRegisteredTypes()).length).toBe(2);

        registry.register('t3', 'PgT3', 'number');
        expect(Object.keys(registry.getRegisteredTypes()).length).toBe(3);
      });
    });

    describe('has', () => {
      it('returns false for unregistered type', () => {
        expect(registry.has('PgUnknown')).toBe(false);
      });

      it('returns true for registered type', () => {
        registry.register('my_type', 'PgMy_type', 'any');
        expect(registry.has('PgMy_type')).toBe(true);
      });

      it('checks prefixed name, not original name', () => {
        registry.register('original_name', 'PgTransformed', 'any');
        expect(registry.has('PgTransformed')).toBe(true);
        expect(registry.has('original_name')).toBe(false);
      });
    });

    describe('Edge cases', () => {
      it('handles many types (stress test with 100 types)', () => {
        for (let i = 0; i < 100; i++) {
          registry.register(`type${i}`, `PgType${i}`, 'any');
        }

        const types = registry.getRegisteredTypes();
        expect(Object.keys(types).length).toBe(100);
        expect(types.PgType0).toBe('any');
        expect(types.PgType99).toBe('any');
      });
    });
  });
});
