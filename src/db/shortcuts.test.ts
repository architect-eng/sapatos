/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { Default, all, sql, param, parent, Parameter, SQLFragment, ParentColumn } from './core';
import {
  insert,
  upsert,
  update,
  deletes,
  truncate,
  select,
  selectOne,
  selectExactlyOne,
  count,
  sum,
  avg,
  min,
  max,
  constraint,
  Constraint,
  doNothing,
  NotExactlyOneError,
} from './shortcuts';

// Mock types for testing
type TestTable = 'users';
type TestColumn = 'id' | 'name' | 'email' | 'age' | 'created_at';

interface TestInsertable {
  id?: number;
  name: string;
  email: string;
  age?: number;
  created_at?: Date;
}

interface TestUpdatable {
  name?: string;
  email?: string;
  age?: number;
}

interface TestWhereable {
  id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
  name?: string | Parameter<string> | SQLFragment | ParentColumn<any>;
  email?: string | Parameter<string> | SQLFragment | ParentColumn<any>;
  age?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
}

describe('shortcuts.ts', () => {
  describe('insert', () => {
    it('should generate INSERT query for single row', () => {
      const query = insert('users' as TestTable, {
        name: 'John Doe',
        email: 'john@example.com',
      } as TestInsertable);

      expect(query).toBeDefined();
      expect(query.compile).toBeDefined();

      const compiled = query.compile();
      expect(compiled.text).toContain('INSERT INTO');
      expect(compiled.text).toContain('users');
      expect(compiled.text).toContain('RETURNING');
      expect(compiled.values).toContain('John Doe');
      expect(compiled.values).toContain('john@example.com');
    });

    it('should generate INSERT query for multiple rows', () => {
      const query = insert('users' as TestTable, [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' },
      ] as TestInsertable[]);

      const compiled = query.compile();
      expect(compiled.text).toContain('INSERT INTO');
      expect(compiled.text).toContain('VALUES');
      expect(compiled.values).toContain('John Doe');
      expect(compiled.values).toContain('Jane Smith');
    });

    it('should handle empty array insert as noop', () => {
      const query = insert('users' as TestTable, []);

      expect(query.noop).toBe(true);
      expect(query.noopResult).toEqual([]);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT null WHERE false');
    });

    it('should support returning specific columns', () => {
      const query = insert(
        'users' as TestTable,
        { name: 'John', email: 'john@example.com' } as TestInsertable,
        { returning: ['id', 'name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('RETURNING');
      expect(compiled.text).toContain('jsonb_build_object');
    });

    it('should support extras option', () => {
      const query = insert(
        'users' as TestTable,
        { name: 'John', email: 'john@example.com' } as TestInsertable,
        {
          extras: {
            timestamp: sql`now()`
          }
        }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('RETURNING');
      expect(compiled.text).toContain('now()');
    });

    it('should handle Default symbol', () => {
      const query = insert('users' as TestTable, {
        name: 'John',
        email: 'john@example.com',
        created_at: Default,
      } as TestInsertable & { created_at: typeof Default });

      const compiled = query.compile();
      expect(compiled.text).toContain('DEFAULT');
    });

    it('should have runResultTransform for single row', () => {
      const query = insert('users' as TestTable, {
        name: 'John',
        email: 'john@example.com',
      } as TestInsertable);

      expect(query.runResultTransform).toBeDefined();

      const mockResult = {
        rows: [{ result: { id: 1, name: 'John', email: 'john@example.com' } }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual({ id: 1, name: 'John', email: 'john@example.com' });
    });

    it('should have runResultTransform for multiple rows', () => {
      const query = insert('users' as TestTable, [
        { name: 'John', email: 'john@example.com' },
        { name: 'Jane', email: 'jane@example.com' },
      ] as TestInsertable[]);

      const mockResult = {
        rows: [
          { result: { id: 1, name: 'John' } },
          { result: { id: 2, name: 'Jane' } },
        ],
        rowCount: 2,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual([
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ]);
    });
  });

  describe('upsert', () => {
    it('should generate upsert query with single column conflict target', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('INSERT INTO');
      expect(compiled.text).toContain('ON CONFLICT');
      expect(compiled.text).toContain('DO UPDATE');
    });

    it('should generate upsert query with multiple column conflict target', () => {
      const query = upsert(
        'users' as TestTable,
        { name: 'John', email: 'john@example.com' } as TestInsertable,
        ['name', 'email'] as TestColumn[]
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('ON CONFLICT');
      expect(compiled.text).toMatch(/\(.*,.*\)/); // Should have parentheses around columns
    });

    it('should generate upsert query with constraint', () => {
      const uniqueConstraint = constraint('users_email_key');
      const query = upsert(
        'users' as TestTable,
        { name: 'John', email: 'john@example.com' } as TestInsertable,
        uniqueConstraint
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('ON CONSTRAINT');
      expect(compiled.text).toContain('users_email_key');
    });

    it('should handle empty array as noop by delegating to insert', () => {
      const query = upsert(
        'users' as TestTable,
        [],
        'id' as TestColumn
      );

      expect(query.noop).toBe(true);
    });

    it('should support updateColumns option', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        { updateColumns: ['name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('UPDATE SET');
    });

    it('should support doNothing for DO NOTHING', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        { updateColumns: doNothing }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('DO NOTHING');
    });

    it('should support noNullUpdateColumns option', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: null as unknown as string } as TestInsertable & { email: null },
        'id' as TestColumn,
        { noNullUpdateColumns: ['email'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('CASE WHEN');
      expect(compiled.text).toContain('IS NULL');
    });

    it('should support noNullUpdateColumns with all', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        { noNullUpdateColumns: all }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('CASE WHEN');
    });

    it('should support updateValues option', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        { updateValues: { age: sql`age + 1` } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('age + 1');
    });

    it('should include $action by default', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('$action');
      expect(compiled.text).toContain('CASE xmax');
    });

    it('should suppress $action with reportAction: "suppress"', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        { reportAction: 'suppress' }
      );

      const compiled = query.compile();
      expect(compiled.text).not.toContain('$action');
    });

    it('should support returning and extras options', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn,
        {
          returning: ['id', 'name'] as TestColumn[],
          extras: { timestamp: sql`now()` },
        }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('RETURNING');
      expect(compiled.text).toContain('now()');
    });

    it('should have runResultTransform for single row', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn
      );

      const mockResult = {
        rows: [{ result: { id: 1, name: 'John', $action: 'INSERT' } }],
        rowCount: 1,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual({ id: 1, name: 'John', $action: 'INSERT' });
    });

    it('should have runResultTransform for multiple rows', () => {
      const query = upsert(
        'users' as TestTable,
        [
          { id: 1, name: 'John', email: 'john@example.com' },
          { id: 2, name: 'Jane', email: 'jane@example.com' },
        ] as TestInsertable[],
        'id' as TestColumn
      );

      const mockResult = {
        rows: [
          { result: { id: 1, $action: 'UPDATE' } },
          { result: { id: 2, $action: 'INSERT' } },
        ],
        rowCount: 2,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual([
        { id: 1, $action: 'UPDATE' },
        { id: 2, $action: 'INSERT' },
      ]);
    });

    it('should handle undefined result in runResultTransform', () => {
      const query = upsert(
        'users' as TestTable,
        { id: 1, name: 'John', email: 'john@example.com' } as TestInsertable,
        'id' as TestColumn
      );

      const mockResult = {
        rows: [],
        rowCount: 0,
        command: 'INSERT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBeUndefined();
    });
  });

  describe('update', () => {
    it('should generate UPDATE query', () => {
      const query = update(
        'users' as TestTable,
        { name: 'John Updated' } as TestUpdatable,
        { id: 1 } as TestWhereable
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('UPDATE');
      expect(compiled.text).toContain('users');
      expect(compiled.text).toContain('SET');
      expect(compiled.text).toContain('WHERE');
      expect(compiled.text).toContain('ROW');
      expect(compiled.values).toContain('John Updated');
    });

    it('should support WHERE with SQLFragment', () => {
      const query = update(
        'users' as TestTable,
        { name: 'John Updated' } as TestUpdatable,
        sql`age > ${param(21)}`
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('WHERE');
      expect(compiled.text).toContain('age >');
      expect(compiled.values).toContain(21);
    });

    it('should support returning option', () => {
      const query = update(
        'users' as TestTable,
        { name: 'John Updated' } as TestUpdatable,
        { id: 1 } as TestWhereable,
        { returning: ['id', 'name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('RETURNING');
    });

    it('should support extras option', () => {
      const query = update(
        'users' as TestTable,
        { name: 'John Updated' } as TestUpdatable,
        { id: 1 } as TestWhereable,
        { extras: { updated_timestamp: sql`now()` } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('now()');
    });

    it('should have runResultTransform', () => {
      const query = update(
        'users' as TestTable,
        { name: 'John Updated' } as TestUpdatable,
        { id: 1 } as TestWhereable
      );

      const mockResult = {
        rows: [
          { result: { id: 1, name: 'John Updated' } },
          { result: { id: 2, name: 'Jane Updated' } },
        ],
        rowCount: 2,
        command: 'UPDATE',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual([
        { id: 1, name: 'John Updated' },
        { id: 2, name: 'Jane Updated' },
      ]);
    });
  });

  describe('deletes', () => {
    it('should generate DELETE query', () => {
      const query = deletes(
        'users' as TestTable,
        { id: 1 } as TestWhereable
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('DELETE FROM');
      expect(compiled.text).toContain('users');
      expect(compiled.text).toContain('WHERE');
    });

    it('should support WHERE with SQLFragment', () => {
      const query = deletes(
        'users' as TestTable,
        sql`age < ${param(18)}`
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('WHERE');
      expect(compiled.text).toContain('age <');
      expect(compiled.values).toContain(18);
    });

    it('should support returning option', () => {
      const query = deletes(
        'users' as TestTable,
        { id: 1 } as TestWhereable,
        { returning: ['id', 'name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('RETURNING');
    });

    it('should support extras option', () => {
      const query = deletes(
        'users' as TestTable,
        { id: 1 } as TestWhereable,
        { extras: { deleted_timestamp: sql`now()` } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('now()');
    });

    it('should have runResultTransform', () => {
      const query = deletes(
        'users' as TestTable,
        { id: 1 } as TestWhereable
      );

      const mockResult = {
        rows: [{ result: { id: 1, name: 'John' } }],
        rowCount: 1,
        command: 'DELETE',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual([{ id: 1, name: 'John' }]);
    });
  });

  describe('truncate', () => {
    it('should generate TRUNCATE query for single table', () => {
      const query = truncate('users' as TestTable);

      const compiled = query.compile();
      expect(compiled.text).toContain('TRUNCATE');
      expect(compiled.text).toContain('users');
    });

    it('should generate TRUNCATE query for multiple tables', () => {
      const query = truncate(['users', 'posts'] as TestTable[]);

      const compiled = query.compile();
      expect(compiled.text).toContain('TRUNCATE');
      expect(compiled.text).toContain('users');
      expect(compiled.text).toContain('posts');
    });

    it('should support RESTART IDENTITY option', () => {
      const query = truncate('users' as TestTable, 'RESTART IDENTITY');

      const compiled = query.compile();
      expect(compiled.text).toContain('RESTART IDENTITY');
    });

    it('should support CONTINUE IDENTITY option', () => {
      const query = truncate('users' as TestTable, 'CONTINUE IDENTITY');

      const compiled = query.compile();
      expect(compiled.text).toContain('CONTINUE IDENTITY');
    });

    it('should support CASCADE option', () => {
      const query = truncate('users' as TestTable, 'CASCADE');

      const compiled = query.compile();
      expect(compiled.text).toContain('CASCADE');
    });

    it('should support RESTRICT option', () => {
      const query = truncate('users' as TestTable, 'RESTRICT');

      const compiled = query.compile();
      expect(compiled.text).toContain('RESTRICT');
    });

    it('should support multiple options', () => {
      const query = truncate('users' as TestTable, 'RESTART IDENTITY', 'CASCADE');

      const compiled = query.compile();
      expect(compiled.text).toContain('RESTART IDENTITY');
      expect(compiled.text).toContain('CASCADE');
    });
  });

  describe('select', () => {
    it('should generate SELECT query with all rows', () => {
      const query = select('users' as TestTable, all);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('FROM');
      expect(compiled.text).toContain('users');
      expect(compiled.text).not.toContain('WHERE');
    });

    it('should generate SELECT query with WHERE clause', () => {
      const query = select('users' as TestTable, { id: 1 } as TestWhereable);

      const compiled = query.compile();
      expect(compiled.text).toContain('WHERE');
    });

    it('should support columns option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { columns: ['id', 'name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('jsonb_build_object');
    });

    it('should support distinct option as boolean', () => {
      const query = select(
        'users' as TestTable,
        all,
        { distinct: true }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('DISTINCT');
    });

    it('should support distinct option with columns', () => {
      const query = select(
        'users' as TestTable,
        all,
        { distinct: ['name'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('DISTINCT ON');
    });

    it('should support order option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { order: { by: 'name' as TestColumn, direction: 'ASC' } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('ORDER BY');
      expect(compiled.text).toContain('ASC');
    });

    it('should support order with nulls option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { order: { by: 'age' as TestColumn, direction: 'DESC', nulls: 'LAST' } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('DESC');
      expect(compiled.text).toContain('NULLS LAST');
    });

    it('should support multiple order specs', () => {
      const query = select(
        'users' as TestTable,
        all,
        {
          order: [
            { by: 'name' as TestColumn, direction: 'ASC' },
            { by: 'age' as TestColumn, direction: 'DESC' },
          ],
        }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('ORDER BY');
      expect(compiled.text).toMatch(/ASC.*DESC/s);
    });

    it('should throw error for invalid order direction', () => {
      expect(() => {
        const query = select(
          'users' as TestTable,
          all,
          { order: { by: 'name' as TestColumn, direction: 'INVALID' as 'ASC' } }
        );
        query.compile();
      }).toThrow('Direction must be ASC/DESC');
    });

    it('should throw error for invalid nulls option', () => {
      expect(() => {
        const query = select(
          'users' as TestTable,
          all,
          { order: { by: 'name' as TestColumn, direction: 'ASC', nulls: 'INVALID' as 'FIRST' } }
        );
        query.compile();
      }).toThrow('Nulls must be FIRST/LAST/undefined');
    });

    it('should support limit option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { limit: 10 }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('LIMIT');
      expect(compiled.values).toContain(10);
    });

    it('should support offset option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { offset: 20 }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('OFFSET');
      expect(compiled.values).toContain(20);
    });

    it('should support withTies option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { limit: 10, withTies: true }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('FETCH FIRST');
      expect(compiled.text).toContain('WITH TIES');
    });

    it('should support groupBy option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { groupBy: 'name' as TestColumn }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('GROUP BY');
    });

    it('should support having option', () => {
      const query = select(
        'users' as TestTable,
        all,
        {
          groupBy: 'name' as TestColumn,
          having: sql`count(*) > ${param(5)}`,
        }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('HAVING');
      expect(compiled.text).toContain('count(*)');
    });

    it('should support extras option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { extras: { full_name: sql`name || ' ' || email` } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('||');
    });

    it('should support alias option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { alias: 'u' }
      );

      const compiled = query.compile();
      // The alias is used in the query - check for quoted alias
      expect(compiled.text).toMatch(/"u"/);
    });

    it('should support lock option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { lock: { for: 'UPDATE' } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('FOR UPDATE');
    });

    it('should support lock with of option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { lock: { for: 'UPDATE', of: 'users' } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('FOR UPDATE');
      expect(compiled.text).toContain('OF');
    });

    it('should support lock with wait option', () => {
      const query = select(
        'users' as TestTable,
        all,
        { lock: { for: 'UPDATE', wait: 'NOWAIT' } }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('NOWAIT');
    });

    it('should support multiple lock options', () => {
      const query = select(
        'users' as TestTable,
        all,
        {
          lock: [
            { for: 'UPDATE', of: 'users' },
            { for: 'SHARE', of: 'posts' },
          ],
        }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('FOR UPDATE');
      expect(compiled.text).toContain('FOR SHARE');
    });

    it('should have runResultTransform for Many mode', () => {
      const query = select('users' as TestTable, all);

      const mockResult = {
        rows: [{ result: [{ id: 1 }, { id: 2 }] }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual([{ id: 1 }, { id: 2 }]);
    });
  });

  describe('selectOne', () => {
    it('should generate SELECT query with LIMIT 1', () => {
      const query = selectOne('users' as TestTable, { id: 1 } as TestWhereable);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('LIMIT');
      expect(compiled.values).toContain(1);
    });

    it('should have runResultTransform that returns single result or undefined', () => {
      const query = selectOne('users' as TestTable, { id: 1 } as TestWhereable);

      const mockResult = {
        rows: [{ result: { id: 1, name: 'John' } }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual({ id: 1, name: 'John' });
    });

    it('should return undefined when no rows found', () => {
      const query = selectOne('users' as TestTable, { id: 999 } as TestWhereable);

      const mockResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBeUndefined();
    });
  });

  describe('selectExactlyOne', () => {
    it('should generate SELECT query with LIMIT 1', () => {
      const query = selectExactlyOne('users' as TestTable, { id: 1 } as TestWhereable);

      const compiled = query.compile();
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('LIMIT');
      expect(compiled.values).toContain(1);
    });

    it('should have runResultTransform that returns single result', () => {
      const query = selectExactlyOne('users' as TestTable, { id: 1 } as TestWhereable);

      const mockResult = {
        rows: [{ result: { id: 1, name: 'John' } }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toEqual({ id: 1, name: 'John' });
    });

    it('should throw NotExactlyOneError when no rows found', () => {
      const query = selectExactlyOne('users' as TestTable, { id: 999 } as TestWhereable);

      const mockResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      expect(() => {
        query.runResultTransform(mockResult);
      }).toThrow(NotExactlyOneError);
    });

    it('should include query in NotExactlyOneError', () => {
      const query = selectExactlyOne('users' as TestTable, { id: 999 } as TestWhereable);

      const mockResult = {
        rows: [],
        rowCount: 0,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      try {
        query.runResultTransform(mockResult);
        expect.fail('Should have thrown NotExactlyOneError');
      } catch (error) {
        expect(error).toBeInstanceOf(NotExactlyOneError);
        expect((error as NotExactlyOneError).query).toBe(query);
      }
    });
  });

  describe('count', () => {
    it('should generate COUNT query', () => {
      const query = count('users' as TestTable, all);

      const compiled = query.compile();
      expect(compiled.text).toContain('count(*)');
    });

    it('should generate COUNT query with WHERE', () => {
      const query = count('users' as TestTable, { age: 25 } as TestWhereable);

      const compiled = query.compile();
      expect(compiled.text).toContain('count(*)');
      expect(compiled.text).toContain('WHERE');
    });

    it('should generate COUNT query with specific columns', () => {
      const query = count(
        'users' as TestTable,
        all,
        { columns: ['id'] as TestColumn[] }
      );

      const compiled = query.compile();
      expect(compiled.text).toContain('count');
    });

    it('should have runResultTransform that returns number', () => {
      const query = count('users' as TestTable, all);

      const mockResult = {
        rows: [{ result: '42' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBe(42);
    });
  });

  describe('sum', () => {
    it('should generate SUM query', () => {
      const query = sum('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const compiled = query.compile();
      expect(compiled.text).toContain('sum');
    });

    it('should have runResultTransform that returns number', () => {
      const query = sum('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const mockResult = {
        rows: [{ result: '1250' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBe(1250);
    });
  });

  describe('avg', () => {
    it('should generate AVG query', () => {
      const query = avg('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const compiled = query.compile();
      expect(compiled.text).toContain('avg');
    });

    it('should have runResultTransform that returns number', () => {
      const query = avg('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const mockResult = {
        rows: [{ result: '32.5' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBe(32.5);
    });
  });

  describe('min', () => {
    it('should generate MIN query', () => {
      const query = min('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const compiled = query.compile();
      expect(compiled.text).toContain('min');
    });

    it('should have runResultTransform that returns number', () => {
      const query = min('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const mockResult = {
        rows: [{ result: '18' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBe(18);
    });
  });

  describe('max', () => {
    it('should generate MAX query', () => {
      const query = max('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const compiled = query.compile();
      expect(compiled.text).toContain('max');
    });

    it('should have runResultTransform that returns number', () => {
      const query = max('users' as TestTable, all, { columns: ['age'] as TestColumn[] });

      const mockResult = {
        rows: [{ result: '95' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      const transformed = query.runResultTransform(mockResult);
      expect(transformed).toBe(95);
    });
  });

  describe('Constraint', () => {
    it('should create Constraint instance', () => {
      const c = constraint('unique_email');

      expect(c).toBeInstanceOf(Constraint);
      expect(c.value).toBe('unique_email');
    });
  });

  describe('NotExactlyOneError', () => {
    it('should create error with message', () => {
      const query = select('users' as TestTable, all);
      const error = new NotExactlyOneError(query, 'Custom message');

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Custom message');
      expect(error.name).toBe('NotExactlyOneError');
      expect(error.query).toBe(query);
    });

    it('should have proper stack trace', () => {
      const query = select('users' as TestTable, all);
      const error = new NotExactlyOneError(query);

      expect(error.stack).toBeDefined();
    });
  });

  describe('doNothing', () => {
    it('should be an empty array', () => {
      expect(doNothing).toEqual([]);
      expect(Array.isArray(doNothing)).toBe(true);
    });
  });

  // ============================================================================
  // LATERAL JOINS - Priority 1: Core Functionality
  // ============================================================================

  describe('lateral joins - core functionality', () => {
    // Additional mock types for lateral testing
    type PostsTable = 'posts';
    type CommentsTable = 'comments';

    interface PostWhereable {
      id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      title?: string | Parameter<string> | SQLFragment | ParentColumn<any>;
    }

    interface CommentWhereable {
      id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      post_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
    }

    it('should generate map mode lateral with single named subquery', () => {
      const lateralQuery = count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: { postCount: lateralQuery }
      });

      const compiled = query.compile();

      // Should include LEFT JOIN LATERAL
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('AS "lateral_postCount"');
      expect(compiled.text).toContain('ON true');

      // Should build jsonb object with lateral results
      expect(compiled.text).toContain('jsonb_build_object');
      expect(compiled.text).toContain('"lateral_postCount".result');

      // The key name should be in the values array (parameterized)
      expect(compiled.values).toContain('postCount');
    });

    it('should generate map mode lateral with multiple subqueries', () => {
      const countQuery = count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const selectQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);

      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: countQuery,
          posts: selectQuery,
          commentCount: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        }
      });

      const compiled = query.compile();

      // Should have three LEFT JOIN LATERAL clauses
      const lateralMatches = compiled.text.match(/LEFT JOIN LATERAL/g);
      expect(lateralMatches).toHaveLength(3);

      // Should have all three lateral aliases (sorted alphabetically)
      expect(compiled.text).toContain('"lateral_commentCount"');
      expect(compiled.text).toContain('"lateral_postCount"');
      expect(compiled.text).toContain('"lateral_posts"');

      // Keys should appear in the values array in sorted order
      expect(compiled.values).toContain('commentCount');
      expect(compiled.values).toContain('postCount');
      expect(compiled.values).toContain('posts');

      // Verify the order in values array (they should be sorted alphabetically)
      const commentCountIdx = compiled.values.indexOf('commentCount');
      const postCountIdx = compiled.values.indexOf('postCount');
      const postsIdx = compiled.values.indexOf('posts');

      expect(commentCountIdx).toBeGreaterThanOrEqual(0);
      expect(postCountIdx).toBeGreaterThanOrEqual(0);
      expect(postsIdx).toBeGreaterThanOrEqual(0);
    });

    it('should generate passthrough mode lateral with single SQLFragment', () => {
      const lateralQuery = count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: lateralQuery
      });

      const compiled = query.compile();

      // Should use "lateral_passthru" alias
      expect(compiled.text).toContain('"lateral_passthru"');
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('ON true');

      // Should select the lateral result
      expect(compiled.text).toContain('"lateral_passthru".result');

      // In passthrough mode, the main table columns should not be individually selected
      // Instead, the lateral result should be the primary selection
      // (The implementation may still reference the table for joins)
    });

    it('should handle parent() column references in WHERE clauses', () => {
      const lateralQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: { posts: lateralQuery }
      });

      const compiled = query.compile();

      // The parent table reference should be compiled into the subquery
      // Note: we can't directly inspect the subquery SQL here, but we can verify
      // the query structure compiles without errors and contains expected elements
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_posts"');
    });

    it('should handle parent() with explicit column', () => {
      // Explicit column - this is the standard use case
      const explicitQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query1 = select('users' as TestTable, all, {
        lateral: { posts: explicitQuery }
      });
      const compiled1 = query1.compile();
      expect(compiled1.text).toContain('LEFT JOIN LATERAL');

      // Implicit parent() requires a currentColumn context which is only
      // available in Whereable object contexts, not in raw SQL templates
      // So we verify that explicit parent('column') works correctly
      const query2 = select('users' as TestTable, all, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });
      const compiled2 = query2.compile();
      expect(compiled2.text).toContain('LEFT JOIN LATERAL');
      expect(compiled2.text).toContain('"lateral_posts"');
    });

    it('should throw error when parent() used without parent table context', () => {
      // Create a query that uses parent() but is NOT within a lateral context
      const queryWithParent = sql`SELECT * FROM posts WHERE user_id = ${parent('id')}`;

      // Compiling outside of lateral context should throw
      expect(() => {
        queryWithParent.compile();
      }).toThrow(/parent.*has no meaning/i);
    });

    it('should throw error for undefined subquery in lateral map', () => {
      expect(() => {
        select('users' as TestTable, all, {
          lateral: {
            postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            badQuery: undefined as any
          }
        });
      }).toThrow(/undefined/i);
    });

    it('should handle empty lateral map', () => {
      const query = select('users' as TestTable, all, {
        lateral: {}
      });

      const compiled = query.compile();

      // Empty lateral map should not add any LATERAL joins
      expect(compiled.text).not.toContain('LEFT JOIN LATERAL');

      // Should still be a valid SELECT
      expect(compiled.text).toContain('SELECT');
      expect(compiled.text).toContain('FROM');
    });

    it('should sort lateral keys alphabetically in SQL generation', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          zPosts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          aCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          mComments: select('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        }
      });

      const compiled = query.compile();

      // Find positions of each lateral join in the SQL
      const aCountIdx = compiled.text.indexOf('"lateral_aCount"');
      const mCommentsIdx = compiled.text.indexOf('"lateral_mComments"');
      const zPostsIdx = compiled.text.indexOf('"lateral_zPosts"');

      // Verify they appear in alphabetical order
      expect(aCountIdx).toBeLessThan(mCommentsIdx);
      expect(mCommentsIdx).toBeLessThan(zPostsIdx);

      // Verify keys are in the values array
      expect(compiled.values).toContain('aCount');
      expect(compiled.values).toContain('mComments');
      expect(compiled.values).toContain('zPosts');

      // Find their positions in the values array
      const aCountValIdx = compiled.values.indexOf('aCount');
      const mCommentsValIdx = compiled.values.indexOf('mComments');
      const zPostsValIdx = compiled.values.indexOf('zPosts');

      // Verify alphabetical ordering in values array
      expect(aCountValIdx).toBeLessThan(mCommentsValIdx);
      expect(mCommentsValIdx).toBeLessThan(zPostsValIdx);
    });

    it('should generate LEFT JOIN LATERAL with ON true', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const compiled = query.compile();

      // Verify the exact lateral join syntax
      expect(compiled.text).toMatch(/LEFT JOIN LATERAL\s*\(/);
      expect(compiled.text).toMatch(/\)\s*AS\s+"lateral_postCount"\s+ON\s+true/i);

      // This means the lateral always joins (no filtering at join level)
      expect(compiled.text).toContain('ON true');
    });
  });

  // ============================================================================
  // LATERAL JOINS - Priority 2: Shortcut Integration
  // ============================================================================

  describe('lateral joins - shortcut integration', () => {
    type PostsTable = 'posts';

    interface PostWhereable {
      id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
    }

    it('should support select shortcut in lateral', () => {
      const lateralQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: { posts: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_posts"');
      expect(compiled.values).toContain('posts');
    });

    it('should support selectOne shortcut in lateral', () => {
      const lateralQuery = selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        order: { by: 'created_at' as 'id' | 'user_id', direction: 'DESC' }
      });
      const query = select('users' as TestTable, all, {
        lateral: { latestPost: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_latestPost"');
      expect(compiled.text).toContain('LIMIT');
    });

    it('should support selectExactlyOne shortcut in lateral', () => {
      const lateralQuery = selectExactlyOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: { singlePost: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_singlePost"');
      // selectExactlyOne includes LIMIT 1 internally
      expect(compiled.text).toContain('LIMIT');
    });

    it('should support count shortcut in lateral', () => {
      const lateralQuery = count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable);
      const query = select('users' as TestTable, all, {
        lateral: { postCount: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_postCount"');
      // The COUNT(*) is inside the subquery
    });

    it('should support sum shortcut in lateral', () => {
      const lateralQuery = sum('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        columns: ['id' as 'id' | 'user_id']
      });
      const query = select('users' as TestTable, all, {
        lateral: { totalPostIds: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_totalPostIds"');
      // The SUM() is inside the subquery
    });

    it('should support avg shortcut in lateral', () => {
      const lateralQuery = avg('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        columns: ['id' as 'id' | 'user_id']
      });
      const query = select('users' as TestTable, all, {
        lateral: { avgPostId: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_avgPostId"');
      // The AVG() is inside the subquery
    });

    it('should support min shortcut in lateral', () => {
      const lateralQuery = min('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        columns: ['id' as 'id' | 'user_id']
      });
      const query = select('users' as TestTable, all, {
        lateral: { minPostId: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_minPostId"');
      // The MIN() is inside the subquery
    });

    it('should support max shortcut in lateral', () => {
      const lateralQuery = max('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        columns: ['id' as 'id' | 'user_id']
      });
      const query = select('users' as TestTable, all, {
        lateral: { maxPostId: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_maxPostId"');
      // The MAX() is inside the subquery
    });

    it('should handle mixed shortcuts in single lateral map', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          latestPost: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            order: { by: 'created_at' as 'id' | 'user_id', direction: 'DESC' }
          }),
          maxPostId: max('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            columns: ['id' as 'id' | 'user_id']
          })
        }
      });

      const compiled = query.compile();

      // Should have four lateral joins
      const lateralMatches = compiled.text.match(/LEFT JOIN LATERAL/g);
      expect(lateralMatches).toHaveLength(4);

      // Verify all shortcuts are present
      expect(compiled.text).toContain('"lateral_posts"');
      expect(compiled.text).toContain('"lateral_postCount"');
      expect(compiled.text).toContain('"lateral_latestPost"');
      expect(compiled.text).toContain('"lateral_maxPostId"');

      // Aggregate functions are inside the subqueries
    });

    it('should verify numeric aggregates in lateral work correctly', () => {
      // When count/sum/avg/min/max are used in lateral, they should still
      // work as subqueries even though main query numeric mode suppresses columns
      const query = count('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const compiled = query.compile();

      // Main query is count(*) on users (lowercase in actual SQL)
      expect(compiled.text).toContain('count(*)');

      // Should still include the lateral join (even though lateral columns
      // are suppressed in numeric mode)
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_postCount"');
    });

    it('should handle shortcuts with RETURNING in laterals', () => {
      // Note: INSERT/UPDATE/DELETE with RETURNING could theoretically be used
      // in lateral context, but this test verifies that SELECT with returning
      // option works (returning is for non-SELECT contexts, but we test compilation)
      const lateralQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        columns: ['id', 'title'] as ('id' | 'title')[]
      });

      const query = select('users' as TestTable, all, {
        lateral: { posts: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_posts"');
    });

    it('should handle lateral with parent references in different shortcuts', () => {
      // Verify that parent() works correctly across different shortcut types
      const query = select('users' as TestTable, all, {
        lateral: {
          // Different ways parent can be used
          postsByFK: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          countByFK: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          singleByFK: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const compiled = query.compile();

      // Should have three lateral joins, all using parent context
      const lateralMatches = compiled.text.match(/LEFT JOIN LATERAL/g);
      expect(lateralMatches).toHaveLength(3);

      expect(compiled.text).toContain('"lateral_postsByFK"');
      expect(compiled.text).toContain('"lateral_countByFK"');
      expect(compiled.text).toContain('"lateral_singleByFK"');
    });
  });

  // ============================================================================
  // LATERAL JOINS - Priority 3: Advanced Scenarios
  // ============================================================================

  describe('lateral joins - advanced scenarios', () => {
    type PostsTable = 'posts';
    type CommentsTable = 'comments';

    interface PostWhereable {
      id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
    }

    interface CommentWhereable {
      id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      post_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
      user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any>;
    }

    it('should handle nested laterals (2 levels: users → posts → comments)', () => {
      // Posts with nested comment count
      const postsWithComments = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: {
          commentCount: count('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable)
        }
      });

      // Users with posts (which have comment counts)
      const query = select('users' as TestTable, all, {
        lateral: { posts: postsWithComments }
      });

      const compiled = query.compile();

      // Should have outer lateral for posts
      expect(compiled.text).toContain('"lateral_posts"');

      // The inner lateral is within the subquery, so we verify compilation succeeds
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
    });

    it('should handle three-level nesting (users → posts → comments → aggregate)', () => {
      // Comments with nested aggregate (hypothetical scenario)
      const commentsQuery = select('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable);

      // Posts with comments
      const postsQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: { comments: commentsQuery }
      });

      // Users with posts (which have comments)
      const query = select('users' as TestTable, all, {
        lateral: { posts: postsQuery }
      });

      const compiled = query.compile();

      // Verify successful compilation of deeply nested structure
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_posts"');
    });

    it('should handle self-joins with alias', () => {
      // Select users with their referrer user
      // This tests that alias handling works correctly
      const query = select('users' as TestTable, all, {
        alias: 'u1',
        lateral: {
          referrer: selectOne('users' as TestTable, { id: parent('id') } as TestWhereable)
        }
      });

      const compiled = query.compile();

      // Should use the alias 'u1' as parent table
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_referrer"');
    });

    it('should work with lateral and main query groupBy/having', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> })
        },
        groupBy: ['id' as TestColumn],
        having: sql`COUNT(*) > ${param(0)}`
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('GROUP BY');
      expect(compiled.text).toContain('HAVING');
      expect(compiled.text).toContain('"lateral_postCount"');
    });

    it('should work with lateral and main query order/limit/offset', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> })
        },
        order: { by: 'name' as TestColumn, direction: 'ASC' },
        limit: 10,
        offset: 5
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('ORDER BY');
      expect(compiled.text).toContain('LIMIT');
      expect(compiled.text).toContain('OFFSET');
      expect(compiled.text).toContain('"lateral_postCount"');
    });

    it('should allow lateral subquery to have its own order/limit', () => {
      const lateralQuery = select('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> }, {
        order: { by: 'created_at' as 'id' | 'user_id', direction: 'DESC' },
        limit: 5
      });

      const query = select('users' as TestTable, all, {
        lateral: { recentPosts: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_recentPosts"');
      // The subquery should have ORDER BY and LIMIT
      expect(compiled.text).toContain('LIMIT');
    });

    it('should handle parent references in extras/computed columns', () => {
      const lateralQuery = select('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> }, {
        extras: {
          parentUserId: sql`${parent('id')}`
        }
      });

      const query = select('users' as TestTable, all, {
        lateral: { posts: lateralQuery }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_posts"');
    });

    it('should handle parent in complex conditions', () => {
      // Note: These use sql tagged templates to test parent() in various contexts
      const conditions = [
        { user_id: parent('id') }, // Simple equality
        // Note: More complex conditions would use condition builders, but those
        // already accept parent() as values, so this tests the basic case
      ];

      for (const condition of conditions) {
        const lateralQuery = select('posts' as PostsTable, condition as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> });
        const query = select('users' as TestTable, all, {
          lateral: { posts: lateralQuery }
        });

        const compiled = query.compile();
        expect(compiled.text).toContain('LEFT JOIN LATERAL');
      }
    });

    it('should prevent passthrough mode when columns option is provided', () => {
      // Type system should prevent this, but we verify behavior
      // With columns specified, lateral must be a map (not passthrough)
      const lateralQuery = count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> });

      const query = select('users' as TestTable, all, {
        columns: ['id', 'name'] as TestColumn[],
        lateral: {
          postCount: lateralQuery
        } // Must be map, not passthrough
      });

      const compiled = query.compile();

      // With columns option, the result is built as a jsonb_build_object
      // The column names should be in the values array
      expect(compiled.values).toContain('id');
      expect(compiled.values).toContain('name');
      expect(compiled.values).toContain('postCount');
      expect(compiled.text).toContain('"lateral_postCount"');
    });

    it('should prevent passthrough mode when extras option is provided', () => {
      const lateralQuery = count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> });

      const query = select('users' as TestTable, all, {
        extras: {
          computed: sql<TestWhereable, number>`1 + 1`
        },
        lateral: {
          postCount: lateralQuery
        } // Must be map, not passthrough
      });

      const compiled = query.compile();

      // Should include both extras and lateral results
      expect(compiled.text).toContain('"lateral_postCount"');
      expect(compiled.text).toContain('1 + 1'); // The computed extra
    });

    it('should handle multiple laterals referencing same parent column', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> }),
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> }),
          comments: select('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable),
          commentCount: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        }
      });

      const compiled = query.compile();

      // Should have four laterals, all referencing parent('id')
      const lateralMatches = compiled.text.match(/LEFT JOIN LATERAL/g);
      expect(lateralMatches).toHaveLength(4);

      expect(compiled.text).toContain('"lateral_posts"');
      expect(compiled.text).toContain('"lateral_postCount"');
      expect(compiled.text).toContain('"lateral_comments"');
      expect(compiled.text).toContain('"lateral_commentCount"');
    });

    it('should handle lateral with DISTINCT on main query', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> })
        },
        distinct: true
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('DISTINCT');
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_postCount"');
    });

    it('should handle lateral with lock option on main query', () => {
      const query = select('users' as TestTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as { user_id?: number | Parameter<number> | SQLFragment | ParentColumn<any> })
        },
        lock: { for: 'UPDATE' }
      });

      const compiled = query.compile();

      expect(compiled.text).toContain('FOR UPDATE');
      expect(compiled.text).toContain('LEFT JOIN LATERAL');
      expect(compiled.text).toContain('"lateral_postCount"');
    });
  });
});
