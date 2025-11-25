import { describe, it, expect } from 'vitest';
import { SQLFragment } from './core';
import {
  createSapatosDb,
  type BaseSchema,
  type SapatosDb,
} from './factory';
import { IsolationLevel } from './transaction';

/**
 * Test schema definition matching what would be generated
 * by the code generator for a database with users and posts tables.
 */
interface TestSchema extends BaseSchema {
  tables: {
    users: {
      Table: 'users';
      Selectable: { id: number; name: string; email: string | null };
      JSONSelectable: { id: number; name: string; email: string | null };
      Whereable: { id?: number; name?: string; email?: string | null };
      Insertable: { id?: number; name: string; email?: string | null };
      Updatable: { id?: number; name?: string; email?: string | null };
      UniqueIndex: 'users_pkey' | 'users_email_key';
      Column: 'id' | 'name' | 'email';
    };
    posts: {
      Table: 'posts';
      Selectable: { id: number; user_id: number; title: string; content: string };
      JSONSelectable: { id: number; user_id: number; title: string; content: string };
      Whereable: { id?: number; user_id?: number; title?: string; content?: string };
      Insertable: { id?: number; user_id: number; title: string; content: string };
      Updatable: { id?: number; user_id?: number; title?: string; content?: string };
      UniqueIndex: 'posts_pkey';
      Column: 'id' | 'user_id' | 'title' | 'content';
    };
  };
}

describe('createSapatosDb', () => {
  describe('factory function', () => {
    it('should return an object with all expected functions', () => {
      const db = createSapatosDb<TestSchema>();

      // SQL building primitives
      expect(db.sql).toBeDefined();
      expect(db.param).toBeDefined();
      expect(db.raw).toBeDefined();
      expect(db.cols).toBeDefined();
      expect(db.vals).toBeDefined();
      expect(db.parent).toBeDefined();

      // Special values
      expect(db.Default).toBeDefined();
      expect(db.self).toBeDefined();
      expect(db.all).toBeDefined();

      // Query shortcut functions
      expect(db.insert).toBeDefined();
      expect(db.upsert).toBeDefined();
      expect(db.update).toBeDefined();
      expect(db.deletes).toBeDefined();
      expect(db.truncate).toBeDefined();
      expect(db.select).toBeDefined();
      expect(db.selectOne).toBeDefined();
      expect(db.selectExactlyOne).toBeDefined();
      expect(db.count).toBeDefined();
      expect(db.sum).toBeDefined();
      expect(db.avg).toBeDefined();
      expect(db.min).toBeDefined();
      expect(db.max).toBeDefined();

      // Constraint helper
      expect(db.Constraint).toBeDefined();
      expect(db.constraint).toBeDefined();
      expect(db.doNothing).toBeDefined();

      // Conditions
      expect(db.eq).toBeDefined();
      expect(db.ne).toBeDefined();
      expect(db.gt).toBeDefined();
      expect(db.gte).toBeDefined();
      expect(db.lt).toBeDefined();
      expect(db.lte).toBeDefined();
      expect(db.isNull).toBeDefined();
      expect(db.isNotNull).toBeDefined();
      expect(db.like).toBeDefined();
      expect(db.ilike).toBeDefined();
      expect(db.isIn).toBeDefined();
      expect(db.isNotIn).toBeDefined();
      expect(db.and).toBeDefined();
      expect(db.or).toBeDefined();
      expect(db.not).toBeDefined();

      // Transaction utilities
      expect(db.transaction).toBeDefined();
      expect(db.serializable).toBeDefined();
      expect(db.repeatableRead).toBeDefined();
      expect(db.readCommitted).toBeDefined();
      expect(db.serializableRO).toBeDefined();
      expect(db.repeatableReadRO).toBeDefined();
      expect(db.readCommittedRO).toBeDefined();
      expect(db.serializableRODeferrable).toBeDefined();
      expect(db.IsolationLevel).toBeDefined();

      // Error classes and utilities
      expect(db.NotExactlyOneError).toBeDefined();
      expect(db.SelectResultMode).toBeDefined();

      // Type conversion utilities
      expect(db.strict).toBeDefined();
      expect(db.toBuffer).toBeDefined();

      // Classes
      expect(db.SQLFragment).toBeDefined();
      expect(db.Parameter).toBeDefined();
      expect(db.ColumnNames).toBeDefined();
      expect(db.ColumnValues).toBeDefined();
      expect(db.ParentColumn).toBeDefined();
      expect(db.DangerousRawString).toBeDefined();
    });

    it('should return the same function references each time', () => {
      const db1 = createSapatosDb<TestSchema>();
      const db2 = createSapatosDb<TestSchema>();

      // The returned functions should be the same references since they're
      // the underlying implementations
      expect(db1.insert).toBe(db2.insert);
      expect(db1.select).toBe(db2.select);
      expect(db1.eq).toBe(db2.eq);
      expect(db1.transaction).toBe(db2.transaction);
    });

    it('should have correct IsolationLevel enum values', () => {
      const db = createSapatosDb<TestSchema>();

      expect(db.IsolationLevel.Serializable).toBe(IsolationLevel.Serializable);
      expect(db.IsolationLevel.RepeatableRead).toBe(IsolationLevel.RepeatableRead);
      expect(db.IsolationLevel.ReadCommitted).toBe(IsolationLevel.ReadCommitted);
    });
  });

  describe('query generation', () => {
    it('should generate INSERT queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.insert('users', { name: 'John', email: 'john@example.com' });

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('INSERT INTO');
      expect(compiled.text).toContain('"users"');
      expect(compiled.text).toContain('RETURNING');
      expect(compiled.values).toContain('John');
      expect(compiled.values).toContain('john@example.com');
    });

    it('should generate SELECT queries with conditions', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', { id: db.eq(1) });

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('"users"');
      expect(compiled.text).toContain('WHERE');
      expect(compiled.values).toContain(1);
    });

    it('should generate SELECT with all rows', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', db.all);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('"users"');
      expect(compiled.text).not.toContain('WHERE');
    });

    it('should generate UPDATE queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.update('users', { name: 'Jane' }, { id: db.eq(1) });

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('UPDATE');
      expect(compiled.text).toContain('"users"');
      expect(compiled.text).toContain('SET');
      expect(compiled.text).toContain('WHERE');
    });

    it('should generate DELETE queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.deletes('users', { id: db.eq(1) });

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('DELETE FROM');
      expect(compiled.text).toContain('"users"');
      expect(compiled.text).toContain('WHERE');
    });

    it('should generate TRUNCATE queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.truncate('users');

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('TRUNCATE');
      expect(compiled.text).toContain('"users"');
    });

    it('should generate UPSERT queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.upsert(
        'users',
        { id: 1, name: 'John', email: 'john@example.com' },
        'id'
      );

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('INSERT INTO');
      expect(compiled.text).toContain('ON CONFLICT');
      expect(compiled.text).toContain('DO UPDATE');
    });

    it('should generate COUNT queries', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.count('users', db.all);

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('count(*)');
    });
  });

  describe('condition functions', () => {
    it('should generate equality conditions', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', { id: db.eq(42) });

      const compiled = query.compile();
      expect(compiled.text).toContain('=');
      expect(compiled.values).toContain(42);
    });

    it('should generate IN conditions', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', { id: db.isIn([1, 2, 3]) });

      const compiled = query.compile();
      expect(compiled.text).toContain('IN');
      expect(compiled.values).toContain(1);
      expect(compiled.values).toContain(2);
      expect(compiled.values).toContain(3);
    });

    it('should generate LIKE conditions', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', { name: db.like('%John%') });

      const compiled = query.compile();
      expect(compiled.text).toContain('LIKE');
      expect(compiled.values).toContain('%John%');
    });

    it('should generate compound OR conditions', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', db.or({ id: db.eq(1) }, { id: db.eq(2) }));

      const compiled = query.compile();
      expect(compiled.text).toContain('OR');
    });

    it('should generate NULL checks', () => {
      const db = createSapatosDb<TestSchema>();
      const query = db.select('users', { email: db.isNull });

      const compiled = query.compile();
      expect(compiled.text).toContain('IS NULL');
    });
  });

  describe('sql tagged template', () => {
    it('should compile sql tagged templates', () => {
      const db = createSapatosDb<TestSchema>();
      const name = 'John';
      const query = db.sql`SELECT * FROM users WHERE name = ${db.param(name)}`;

      expect(query).toBeInstanceOf(SQLFragment);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT * FROM users WHERE name =');
      expect(compiled.values).toContain('John');
    });

    it('should support raw SQL', () => {
      const db = createSapatosDb<TestSchema>();
      const tableName = 'users';
      const query = db.sql`SELECT * FROM ${db.raw(tableName)}`;

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT * FROM users');
    });
  });

  describe('SapatosDb type', () => {
    it('should allow typing variables with SapatosDb<Schema>', () => {
      // This is a compile-time test - if it compiles, it passes
      const db: SapatosDb<TestSchema> = createSapatosDb<TestSchema>();
      expect(db).toBeDefined();
    });
  });
});
