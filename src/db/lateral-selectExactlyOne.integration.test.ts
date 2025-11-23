import { Pool } from 'pg';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  startTestDatabase,
  stopTestDatabase,
  setupTestSchema,
  cleanTestSchema,
  TestDatabase,
  insertUser,
  insertPost,
} from '../test-helpers/integration-db';
import { all, parent } from './core';
import {
  select,
  selectOne,
  selectExactlyOne,
  NotExactlyOneError,
} from './shortcuts';

// Types for our test tables
type UsersTable = 'users';

// Types for posts table
type PostsTable = 'posts';

interface PostWhereable {
  id?: number;
  user_id?: number;
  title?: string;
  published?: boolean;
}

/**
 * LATERAL JOIN INVARIANT ENFORCEMENT TEST SUITE
 *
 * This test suite validates that lateral joins correctly enforce runtime invariants,
 * particularly for selectExactlyOne which must throw NotExactlyOneError when the
 * row count != 1.
 *
 * IMPLEMENTATION:
 * Lateral subqueries store their runResultTransform in metadata during SQL generation.
 * After the parent query executes, these transforms are applied recursively to lateral
 * results, ensuring that invariants like selectExactlyOne's row count validation are
 * enforced even though the SQL executes as a single statement.
 *
 * CORRECT BEHAVIOR:
 * - selectExactlyOne (direct) returns 0 rows → throws NotExactlyOneError ✅
 * - selectExactlyOne (lateral) returns 0 rows → throws NotExactlyOneError ✅
 * - selectOne (lateral) returns 0 rows → returns null ✅
 *
 * KNOWN LIMITATION:
 * The LIMIT 1 clause at SQL level masks multiple-row scenarios. When selectExactlyOne
 * matches >1 row, only the first is returned, making it impossible to detect the
 * violation. This is documented in "DOCUMENTED LIMITATION" tests below.
 */
describe('Lateral Joins - Invariant Enforcement', () => {
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

  describe('Category 1: Basic Invariant Enforcement', () => {
    it('throws NotExactlyOneError when lateral returns 0 rows', async () => {
      // Setup: User with no posts
      await insertUser(pool, { name: 'Alice', email: 'alice@example.com' });

      const query = select('users' as UsersTable, { name: 'Alice' }, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });

    it('selectOne lateral with no matching rows returns null (control test)', async () => {
      // Setup: User with no posts
      await insertUser(pool, { name: 'Bob', email: 'bob@example.com' });

      const query = select('users' as UsersTable, { name: 'Bob' }, {
        lateral: {
          post: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
        },
      });

      // EXPECTED BEHAVIOR: selectOne should return null when no rows found
      const result = await query.run(pool);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob');
      expect(result[0].post).toBeNull();
    });

    it('direct selectExactlyOne (non-lateral) throws when no rows found (control test)', async () => {
      // Setup: User with no posts
      const userId = await insertUser(pool, { name: 'Charlie', email: 'charlie@example.com' });

      const query = selectExactlyOne('posts' as PostsTable, { user_id: userId } as PostWhereable);

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('Category 2: Multiple Row Scenarios (Known Limitation)', () => {
    it('LIMITATION: selectExactlyOne lateral with multiple matching rows returns first row', async () => {
      // Setup: User with 2 posts
      const userId = await insertUser(pool, { name: 'Dave', email: 'dave@example.com' });
      await insertPost(pool, { user_id: userId, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: userId, title: 'Post 2', published: true });

      const query = select('users' as UsersTable, { name: 'Dave' }, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, {
            user_id: parent('id'),
            published: true,
          } as PostWhereable),
        },
      });

      // Known limitation: LIMIT 1 at SQL level returns only the first row,
      // making it impossible to detect that multiple rows originally matched
      const result = await query.run(pool);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Dave');
      expect(result[0].post).not.toBeNull();
      expect(result[0].post.title).toBe('Post 1');
    });

    it('documents that LIMIT 1 masks multiple row detection in lateral subqueries', async () => {

      const userId = await insertUser(pool, { name: 'Eve', email: 'eve@example.com' });
      await insertPost(pool, { user_id: userId, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: userId, title: 'Post 2', published: true });
      await insertPost(pool, { user_id: userId, title: 'Post 3', published: true });

      const query = select('users' as UsersTable, { name: 'Eve' }, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, {
            user_id: parent('id'),
            published: true,
          } as PostWhereable),
        },
      });

      // The SQL includes LIMIT 1, so PostgreSQL only returns 1 row.
      // The transform cannot detect that 3 rows originally matched.
      const compiled = query.compile();
      expect(compiled.text).toContain('LIMIT');
      expect(compiled.values).toContain(1);

      const result = await query.run(pool);
      expect(result[0].post).not.toBeNull();
    });
  });

  describe('Category 3: Array Results with Mixed Invariant States', () => {
    it('throws NotExactlyOneError when any row in array violates lateral invariant', async () => {
      // Setup: User 1 has a post, User 2 has no posts, User 3 has a post
      const user1 = await insertUser(pool, { name: 'Frank', email: 'frank@example.com' });
      await insertUser(pool, { name: 'Grace', email: 'grace@example.com' });
      const user3 = await insertUser(pool, { name: 'Hank', email: 'hank@example.com' });

      await insertPost(pool, { user_id: user1, title: 'Frank Post', published: true });
      // Grace has no posts
      await insertPost(pool, { user_id: user3, title: 'Hank Post', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, {
            user_id: parent('id'),
            published: true,
          } as PostWhereable),
        },
      });

      // Query fails when processing Grace (second user) who has no posts
      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });

    it('throws NotExactlyOneError when all rows in array violate lateral invariant', async () => {
      // Setup: Multiple users, none with published posts
      await insertUser(pool, { name: 'Ian', email: 'ian@example.com' });
      await insertUser(pool, { name: 'Jane', email: 'jane@example.com' });
      await insertUser(pool, { name: 'Kyle', email: 'kyle@example.com' });

      const query = select('users' as UsersTable, all, {
        lateral: {
          requiredPost: selectExactlyOne('posts' as PostsTable, {
            user_id: parent('id'),
            published: true,
          } as PostWhereable),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('Category 4: Nested Lateral Invariants', () => {
    it('enforces selectExactlyOne invariant in nested lateral structure', async () => {
      const userId = await insertUser(pool, { name: 'Laura', email: 'laura@example.com' });
      await insertPost(pool, { user_id: userId, title: 'Laura Post', published: true });

      const query = select('users' as UsersTable, { name: 'Laura' }, {
        lateral: {
          post: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            lateral: {
              topComment: selectExactlyOne('comments' as const, {
                post_id: parent('id'),
              }),
            },
          }),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });

    it('enforces inner lateral selectExactlyOne when outer lateral succeeds', async () => {
      const user1 = await insertUser(pool, { name: 'Mike', email: 'mike@example.com' });
      const user2 = await insertUser(pool, { name: 'Nina', email: 'nina@example.com' });

      await insertPost(pool, { user_id: user1, title: 'Mike Post', published: true });
      await insertPost(pool, { user_id: user2, title: 'Nina Post', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          latestPost: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            lateral: {
              featuredComment: selectExactlyOne('comments' as const, {
                post_id: parent('id'),
              }),
            },
          }),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('Category 5: Passthrough Lateral Mode', () => {
    it('enforces selectExactlyOne invariant in passthrough mode (single result)', async () => {
      await insertUser(pool, { name: 'Oscar', email: 'oscar@example.com' });

      const query = select('users' as UsersTable, { name: 'Oscar' }, {
        lateral: selectExactlyOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });

    it('enforces selectExactlyOne invariant in passthrough mode (array results)', async () => {
      const user1 = await insertUser(pool, { name: 'Paul', email: 'paul@example.com' });
      await insertUser(pool, { name: 'Quinn', email: 'quinn@example.com' });

      await insertPost(pool, { user_id: user1, title: 'Paul Post', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: selectExactlyOne('posts' as PostsTable, {
          user_id: parent('id'),
          published: true,
        } as PostWhereable),
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('Category 6: Edge Cases', () => {
    it('empty outer table returns empty array (no invariant violation)', async () => {

      const query = select('users' as UsersTable, all, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
        },
      });

      const result = await query.run(pool);
      expect(result).toHaveLength(0);
    });

    it('throws NotExactlyOneError with complex WHERE clause that matches nothing', async () => {
      const userId = await insertUser(pool, { name: 'Rachel', email: 'rachel@example.com' });
      await insertPost(pool, { user_id: userId, title: 'Draft Post', published: false });
      await insertPost(pool, { user_id: userId, title: 'Another Draft', published: false });

      const query = select('users' as UsersTable, { name: 'Rachel' }, {
        lateral: {
          publishedPost: selectExactlyOne('posts' as PostsTable, {
            user_id: parent('id'),
            published: true,
          } as PostWhereable),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });

    it('enforces invariant with columns option specified', async () => {
      const userId = await insertUser(pool, { name: 'Sam', email: 'sam@example.com' });

      const query = select('users' as UsersTable, { id: userId }, {
        lateral: {
          post: selectExactlyOne(
            'posts' as PostsTable,
            { user_id: parent('id') } as PostWhereable,
            { columns: ['id', 'title'] }
          ),
        },
      });

      await expect(query.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });

  describe('Summary: selectOne vs selectExactlyOne Behavior', () => {
    it('selectExactlyOne throws while selectOne returns null for same scenario', async () => {

      const userId = await insertUser(pool, { name: 'Tina', email: 'tina@example.com' });

      const queryWithOne = select('users' as UsersTable, { id: userId }, {
        lateral: {
          post: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
        },
      });

      const queryWithExactlyOne = select('users' as UsersTable, { id: userId }, {
        lateral: {
          post: selectExactlyOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
        },
      });

      // selectOne returns null when no lateral results
      const resultOne = await queryWithOne.run(pool);
      expect(resultOne).toHaveLength(1);
      expect(resultOne[0]?.post).toBeNull();

      // selectExactlyOne throws NotExactlyOneError when no lateral results
      await expect(queryWithExactlyOne.run(pool)).rejects.toThrow(NotExactlyOneError);
    });
  });
});
