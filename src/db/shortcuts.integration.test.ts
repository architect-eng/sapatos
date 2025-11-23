import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  setupTestSchema,
  cleanTestSchema,
  TestDatabase,
} from '../test-helpers/integration-db';
import { all } from './core';
import {
  insert,
  select,
  selectOne,
  selectExactlyOne,
  update,
  deletes,
  upsert,
  count,
  NotExactlyOneError,
} from './shortcuts';

// Types for our test tables
type UsersTable = 'users';

interface UserInsertable {
  name: string;
  email: string;
  age?: number | null;
  created_at?: Date;
}

interface UserUpdatable {
  name?: string;
  email?: string;
  age?: number | null;
}

interface UserWhereable {
  id?: number;
  name?: string;
  email?: string;
  age?: number | null;
}

describe('shortcuts.ts - Integration Tests', () => {
  let db: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    db = await startTestDatabase();
    pool = db.pool;
    await setupTestSchema(pool);
  });

  afterAll(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await cleanTestSchema(pool);
  });

  describe('insert', () => {
    it('should insert a single row and return it', async () => {
      const query = insert('users' as UsersTable, {
        name: 'John Doe',
        email: 'john@example.com',
        age: 30,
      } as UserInsertable);

      const result = await query.run(pool);

      expect(result).toBeDefined();
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('john@example.com');
      expect(result.age).toBe(30);
      expect(result.id).toBeTypeOf('number');
    });

    it('should insert multiple rows and return them', async () => {
      const query = insert('users' as UsersTable, [
        { name: 'John Doe', email: 'john@example.com' },
        { name: 'Jane Smith', email: 'jane@example.com' },
      ] as UserInsertable[]);

      const results = await query.run(pool) as Array<{ id: number; name: string; email: string }>;

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('John Doe');
      expect(results[1].name).toBe('Jane Smith');
      expect(results[0].id).toBeTypeOf('number');
      expect(results[1].id).toBeTypeOf('number');
      expect(results[0].id).not.toBe(results[1].id);
    });

    it('should handle empty array insert', async () => {
      const query = insert('users' as UsersTable, []);
      const results = await query.run(pool);

      expect(results).toEqual([]);
    });

    it('should return specific columns when requested', async () => {
      const query = insert(
        'users' as UsersTable,
        { name: 'John', email: 'john@example.com' } as UserInsertable,
        { returning: ['id', 'name'] }
      );

      const result = await query.run(pool);

      expect(result.id).toBeTypeOf('number');
      expect(result.name).toBe('John');
      // Should only have id and name
      expect(Object.keys(result)).toHaveLength(2);
    });
  });

  describe('select', () => {
    beforeEach(async () => {
      // Insert test data
      await insert('users' as UsersTable, [
        { name: 'Alice', email: 'alice@example.com', age: 25 },
        { name: 'Bob', email: 'bob@example.com', age: 30 },
        { name: 'Charlie', email: 'charlie@example.com', age: 35 },
      ] as UserInsertable[]).run(pool);
    });

    it('should select all rows', async () => {
      const query = select('users' as UsersTable, all);
      const results = await query.run(pool);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Alice');
      expect(results[1].name).toBe('Bob');
      expect(results[2].name).toBe('Charlie');
    });

    it('should select rows with WHERE clause', async () => {
      const query = select('users' as UsersTable, { name: 'Bob' } as UserWhereable);
      const results = await query.run(pool);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Bob');
      expect(results[0].email).toBe('bob@example.com');
    });

    it('should support limit option', async () => {
      const query = select('users' as UsersTable, all, { limit: 2 });
      const results = await query.run(pool);

      expect(results).toHaveLength(2);
    });

    it('should support offset option', async () => {
      const query = select('users' as UsersTable, all, {
        order: { by: 'name', direction: 'ASC' },
        offset: 1,
      });
      const results = await query.run(pool);

      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Bob');
    });

    it('should support ordering', async () => {
      const query = select('users' as UsersTable, all, {
        order: { by: 'age', direction: 'DESC' },
      });
      const results = await query.run(pool);

      expect(results[0].age).toBe(35);
      expect(results[1].age).toBe(30);
      expect(results[2].age).toBe(25);
    });
  });

  describe('selectOne', () => {
    beforeEach(async () => {
      await insert('users' as UsersTable, {
        name: 'Alice',
        email: 'alice@example.com',
        age: 25,
      } as UserInsertable).run(pool);
    });

    it('should select one row', async () => {
      const query = selectOne('users' as UsersTable, { name: 'Alice' } as UserWhereable);
      const result = await query.run(pool);

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
    });

    it('should return undefined when no rows found', async () => {
      const query = selectOne('users' as UsersTable, { name: 'NonExistent' } as UserWhereable);
      const result = await query.run(pool);

      expect(result).toBeUndefined();
    });
  });

  describe('selectExactlyOne', () => {
    beforeEach(async () => {
      await insert('users' as UsersTable, {
        name: 'Alice',
        email: 'alice@example.com',
        age: 25,
      } as UserInsertable).run(pool);
    });

    it('should select exactly one row', async () => {
      const query = selectExactlyOne('users' as UsersTable, { name: 'Alice' } as UserWhereable);
      const result = await query.run(pool);

      expect(result).toBeDefined();
      expect(result.name).toBe('Alice');
    });

    it('should throw when no rows found', async () => {
      const query = selectExactlyOne('users' as UsersTable, { name: 'NonExistent' } as UserWhereable);

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await insert('users' as UsersTable, [
        { name: 'Alice', email: 'alice@example.com', age: 25 },
        { name: 'Bob', email: 'bob@example.com', age: 30 },
      ] as UserInsertable[]).run(pool);
    });

    it('should update rows and return them', async () => {
      const query = update(
        'users' as UsersTable,
        { age: 26 } as UserUpdatable,
        { name: 'Alice' } as UserWhereable
      );

      const results = await query.run(pool);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice');
      expect(results[0].age).toBe(26);
    });

    it('should update multiple fields', async () => {
      const query = update(
        'users' as UsersTable,
        { name: 'Alice Updated', age: 26 } as UserUpdatable,
        { name: 'Alice' } as UserWhereable
      );

      const results = await query.run(pool);

      expect(results[0].name).toBe('Alice Updated');
      expect(results[0].age).toBe(26);
    });

    it('should return empty array when no rows match', async () => {
      const query = update(
        'users' as UsersTable,
        { age: 99 } as UserUpdatable,
        { name: 'NonExistent' } as UserWhereable
      );

      const results = await query.run(pool);
      expect(results).toHaveLength(0);
    });
  });

  describe('deletes', () => {
    beforeEach(async () => {
      await insert('users' as UsersTable, [
        { name: 'Alice', email: 'alice@example.com', age: 25 },
        { name: 'Bob', email: 'bob@example.com', age: 30 },
      ] as UserInsertable[]).run(pool);
    });

    it('should delete rows and return them', async () => {
      const query = deletes('users' as UsersTable, { name: 'Alice' } as UserWhereable);
      const results = await query.run(pool);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice');

      // Verify deletion
      const remaining = await select('users' as UsersTable, all).run(pool);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe('Bob');
    });

    it('should return empty array when no rows match', async () => {
      const query = deletes('users' as UsersTable, { name: 'NonExistent' } as UserWhereable);
      const results = await query.run(pool);

      expect(results).toHaveLength(0);
    });
  });

  describe('upsert', () => {
    it('should insert when no conflict', async () => {
      const query = upsert(
        'users' as UsersTable,
        { name: 'Alice', email: 'alice@example.com', age: 25 } as UserInsertable,
        'email'
      );

      const result = await query.run(pool);

      expect(result.$action).toBe('INSERT');
      expect(result.name).toBe('Alice');
      expect(result.email).toBe('alice@example.com');
    });

    it('should update when conflict occurs', async () => {
      // First insert
      await insert('users' as UsersTable, {
        name: 'Alice',
        email: 'alice@example.com',
        age: 25,
      } as UserInsertable).run(pool);

      // Upsert with same email
      const query = upsert(
        'users' as UsersTable,
        { name: 'Alice Updated', email: 'alice@example.com', age: 26 } as UserInsertable,
        'email'
      );

      const result = await query.run(pool);

      expect(result.$action).toBe('UPDATE');
      expect(result.name).toBe('Alice Updated');
      expect(result.age).toBe(26);

      // Verify only one row exists
      const allUsers = await select('users' as UsersTable, all).run(pool);
      expect(allUsers).toHaveLength(1);
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      await insert('users' as UsersTable, [
        { name: 'Alice', email: 'alice@example.com', age: 25 },
        { name: 'Bob', email: 'bob@example.com', age: 30 },
        { name: 'Charlie', email: 'charlie@example.com', age: 35 },
      ] as UserInsertable[]).run(pool);
    });

    it('should count all rows', async () => {
      const query = count('users' as UsersTable, all);
      const result = await query.run(pool);

      expect(result).toBe(3);
    });

    it('should count rows with WHERE clause', async () => {
      const query = count('users' as UsersTable, { name: 'Bob' } as UserWhereable);
      const result = await query.run(pool);

      expect(result).toBe(1);
    });
  });
});
