/* eslint-disable @typescript-eslint/no-explicit-any */
import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  TestDatabase,
} from '../test-helpers/integration-db';
import * as conditions from './conditions';
import { SQLFragment } from './core';
import { select, insert, update } from './shortcuts';

// Enum types matching our test schema
type UserRole = 'admin' | 'moderator' | 'user';
type UserStatus = 'active' | 'inactive' | 'suspended';

// Type definitions for our test table
type UsersTable = 'test_users_enum';

interface UserInsertable {
  name: string;
  role: UserRole;
  status: UserStatus;
}

interface UserWhereable {
  id?: number | SQLFragment<any, any>;
  name?: string | SQLFragment<any, any>;
  role?: UserRole | SQLFragment<any, any>;
  status?: UserStatus | SQLFragment<any, any>;
}

interface UserSelectable {
  id: number;
  name: string;
  role: UserRole;
  status: UserStatus;
}

describe('conditions.ts - Integration Tests with Enums', () => {
  let db: TestDatabase;
  let pool: Pool;

  beforeAll(async () => {
    db = await startTestDatabase();
    pool = db.pool;

    // Create enum types and test table
    await pool.query(`
      DROP TABLE IF EXISTS test_users_enum CASCADE;
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS user_status CASCADE;

      CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'user');
      CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended');

      CREATE TABLE test_users_enum (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        role user_role NOT NULL DEFAULT 'user',
        status user_status NOT NULL DEFAULT 'active'
      );
    `);
  }, 60000);

  afterAll(async () => {
    // Clean up test table and types
    await pool.query(`
      DROP TABLE IF EXISTS test_users_enum CASCADE;
      DROP TYPE IF EXISTS user_role CASCADE;
      DROP TYPE IF EXISTS user_status CASCADE;
    `);
    await stopTestDatabase();
  }, 60000);

  beforeEach(async () => {
    await pool.query('TRUNCATE test_users_enum RESTART IDENTITY CASCADE');
  });

  describe('eq - equality with enum types', () => {
    it('should filter by enum value without requiring as const', async () => {
      // Insert test data
      await insert('test_users_enum' as UsersTable, {
        name: 'Alice',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Bob',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      // This works without 'as const' thanks to const type parameters!
      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.eq('admin') } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Alice');
      expect(results[0].role).toBe('admin');
    });

    it('should work with multiple enum columns', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Charlie',
        role: 'moderator',
        status: 'suspended',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Dave',
        role: 'moderator',
        status: 'active',
      } as UserInsertable).run(pool);

      // Both enum conditions work without 'as const'
      const query = select(
        'test_users_enum' as UsersTable,
        {
          role: conditions.eq('moderator'),
          status: conditions.eq('suspended'),
        } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Charlie');
    });
  });

  describe('ne - not equal with enum types', () => {
    it('should filter out specific enum value', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Eve',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Frank',
        role: 'user',
        status: 'inactive',
      } as UserInsertable).run(pool);

      // No 'as const' needed!
      const query = select(
        'test_users_enum' as UsersTable,
        { status: conditions.ne('active') } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Frank');
      expect(results[0].status).toBe('inactive');
    });
  });

  describe('isIn - array membership with enum types', () => {
    it('should match any value in enum array', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Grace',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Heidi',
        role: 'moderator',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Ivan',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      // Array literal works without 'as const'!
      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isIn(['admin', 'moderator']) } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Grace', 'Heidi']);
    });

    it('should work with status enum array', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Judy',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Kevin',
        role: 'user',
        status: 'inactive',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Laura',
        role: 'user',
        status: 'suspended',
      } as UserInsertable).run(pool);

      const query = select(
        'test_users_enum' as UsersTable,
        { status: conditions.isIn(['inactive', 'suspended']) } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Kevin', 'Laura']);
    });

    it('should return no results with empty array', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Mike',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isIn([]) } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(0);
    });
  });

  describe('isNotIn - array exclusion with enum types', () => {
    it('should exclude values in enum array', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Nancy',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Oscar',
        role: 'moderator',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Peggy',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      // Exclude admin and moderator without 'as const'
      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isNotIn(['admin', 'moderator']) } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Peggy');
      expect(results[0].role).toBe('user');
    });

    it('should return all results with empty array', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Quinn',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Rachel',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isNotIn([]) } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(2);
    });
  });

  describe('isDistinctFrom - NULL-safe equality with enum types', () => {
    it('should distinguish between enum values', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Sam',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Tina',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      // No 'as const' needed for NULL-safe comparison
      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isDistinctFrom('user') } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Sam');
      expect(results[0].role).toBe('admin');
    });
  });

  describe('isNotDistinctFrom - NULL-safe equality with enum types', () => {
    it('should match enum values with NULL-safe semantics', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Uma',
        role: 'moderator',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Victor',
        role: 'moderator',
        status: 'suspended',
      } as UserInsertable).run(pool);

      // No 'as const' needed
      const query = select(
        'test_users_enum' as UsersTable,
        { role: conditions.isNotDistinctFrom('moderator') } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Uma', 'Victor']);
    });
  });

  describe('combined conditions with enums', () => {
    it('should handle complex queries with multiple enum conditions', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Walter',
        role: 'admin',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Xena',
        role: 'admin',
        status: 'inactive',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Yolanda',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Zeke',
        role: 'moderator',
        status: 'suspended',
      } as UserInsertable).run(pool);

      // Complex query: admins OR moderators, but NOT suspended
      const query = select(
        'test_users_enum' as UsersTable,
        {
          role: conditions.isIn(['admin', 'moderator']),
          status: conditions.ne('suspended'),
        } as UserWhereable,
      );

      const results = await query.run(pool) as UserSelectable[];

      expect(results).toHaveLength(2);
      expect(results.map(r => r.name).sort()).toEqual(['Walter', 'Xena']);
    });
  });

  describe('update with enum conditions', () => {
    it('should update rows matching enum conditions', async () => {
      await insert('test_users_enum' as UsersTable, {
        name: 'Aaron',
        role: 'user',
        status: 'active',
      } as UserInsertable).run(pool);

      await insert('test_users_enum' as UsersTable, {
        name: 'Brenda',
        role: 'user',
        status: 'inactive',
      } as UserInsertable).run(pool);

      // Update all inactive users to suspended
      const query = update(
        'test_users_enum' as UsersTable,
        { status: 'suspended' as UserStatus },
        { status: conditions.eq('inactive') } as UserWhereable,
      );

      await query.run(pool);

      // Verify the update
      const results = await select(
        'test_users_enum' as UsersTable,
        { status: conditions.eq('suspended') } as UserWhereable,
      ).run(pool) as UserSelectable[];

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Brenda');
    });
  });
});
