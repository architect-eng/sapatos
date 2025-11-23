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
  insertComment,
} from '../test-helpers/integration-db';
import { all, parent } from './core';
import {
  insert,
  select,
  selectOne,
  selectExactlyOne,
  update,
  deletes,
  upsert,
  count,
  sum,
  max,
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

// Types for posts table
type PostsTable = 'posts';

interface PostWhereable {
  id?: number;
  user_id?: number;
  title?: string;
  published?: boolean;
}

// Types for comments table
type CommentsTable = 'comments';

interface CommentWhereable {
  id?: number;
  post_id?: number;
  user_id?: number;
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

  // ============================================================================
  // LATERAL JOINS - Integration Tests
  // ============================================================================

  describe('lateral joins - basic execution', () => {
    beforeEach(async () => {
      // Insert test data
      await insertUser(pool, { name: 'Alice', email: 'alice@example.com', age: 25 });
      await insertUser(pool, { name: 'Bob', email: 'bob@example.com', age: 30 });
      await insertUser(pool, { name: 'Charlie', email: 'charlie@example.com', age: 35 });
    });

    it('should execute map mode lateral with count', async () => {
      // Add posts for Alice
      await insertPost(pool, { user_id: 1, title: 'Alice Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Alice Post 2', published: false });
      await insertPost(pool, { user_id: 2, title: 'Bob Post 1', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('Alice');
      expect(result[0].postCount).toBe(2);
      expect(result[1].name).toBe('Bob');
      expect(result[1].postCount).toBe(1);
      expect(result[2].name).toBe('Charlie');
      expect(result[2].postCount).toBe(0);
    });

    it('should execute map mode lateral with select array', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: true });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].posts[0].title).toBe('Post 1');
      expect(result[0].posts[1].title).toBe('Post 2');
    });

    it('should execute map mode lateral with selectOne', async () => {
      await insertPost(pool, { user_id: 1, title: 'Old Post', published: true });
      await insertPost(pool, { user_id: 1, title: 'New Post', published: true });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          latestPost: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            order: { by: 'id' as 'id' | 'user_id', direction: 'DESC' }
          })
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].latestPost).toBeDefined();
      if (result[0].latestPost) {
        expect(result[0].latestPost.title).toBe('New Post');
      }
    });

    it('should execute passthrough mode lateral', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: true });
      await insertPost(pool, { user_id: 2, title: 'Post 3', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
      });

      const result = await query.run(pool);

      // Passthrough mode returns just the count for each user
      expect(result).toEqual([2, 1, 0]);
    });

    it('should execute multiple laterals in single query', async () => {
      const post1 = await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: false });
      await insertComment(pool, { post_id: post1, user_id: 1, content: 'Comment 1' });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          commentCount: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].postCount).toBe(2);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].commentCount).toBe(1);
    });

    it('should handle lateral with null foreign keys', async () => {
      // Charlie has no posts
      const query = select('users' as UsersTable, { name: 'Charlie' } as UserWhereable, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          latestPost: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toEqual([]);
      expect(result[0].latestPost).toBeNull();
    });

    it('should execute lateral with aggregates', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 3', published: true });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          maxPostId: max('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            columns: ['id' as 'id' | 'user_id']
          }),
          postIdSum: sum('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            columns: ['id' as 'id' | 'user_id']
          })
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].postCount).toBe(3);
      expect(result[0].maxPostId).toBeGreaterThan(0);
      expect(result[0].postIdSum).toBeGreaterThan(0);
    });
  });

  describe('lateral joins - nested execution', () => {
    beforeEach(async () => {
      const userId = await insertUser(pool, { name: 'Alice', email: 'alice@example.com' });
      const post1 = await insertPost(pool, { user_id: userId, title: 'Post 1', published: true });
      const post2 = await insertPost(pool, { user_id: userId, title: 'Post 2', published: true });
      await insertComment(pool, { post_id: post1, user_id: userId, content: 'Comment on post 1' });
      await insertComment(pool, { post_id: post1, user_id: userId, content: 'Another comment on post 1' });
      await insertComment(pool, { post_id: post2, user_id: userId, content: 'Comment on post 2' });
    });

    it('should execute 2-level nested laterals (users → posts → comment count)', async () => {
      const postsWithComments = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: {
          commentCount: count('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable)
        }
      });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          posts: postsWithComments
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].posts[0].commentCount).toBe(2); // Post 1 has 2 comments
      expect(result[0].posts[1].commentCount).toBe(1); // Post 2 has 1 comment
    });

    it('should execute 3-level nested laterals (users → posts → comments)', async () => {
      const commentsQuery = select('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable);
      const postsQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: { comments: commentsQuery }
      });
      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: { posts: postsQuery }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].posts[0].comments).toBeInstanceOf(Array);
      expect(result[0].posts[0].comments.length).toBeGreaterThan(0);
    });

    it('should handle nested lateral with selectOne', async () => {
      const postsWithLatestComment = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: {
          latestComment: selectOne('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable, {
            order: { by: 'id' as 'id' | 'post_id' | 'user_id', direction: 'DESC' }
          })
        }
      });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: { posts: postsWithLatestComment }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].posts[0].latestComment).toBeDefined();
      if (result[0].posts[0].latestComment) {
        expect(result[0].posts[0].latestComment.content).toBeTruthy();
      }
    });

    it('should handle mixed nested and flat laterals', async () => {
      const postsWithCommentCount = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: {
          commentCount: count('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable)
        }
      });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          posts: postsWithCommentCount,
          totalComments: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].posts).toHaveLength(2);
      expect(result[0].totalComments).toBe(3);
      expect(result[0].posts[0].commentCount).toBeGreaterThan(0);
    });

    it('should maintain parent context across deep nesting', async () => {
      // This tests that parent() correctly refers to the immediate parent
      // at each nesting level
      const commentsQuery = select('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable);
      const postsQuery = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: { comments: commentsQuery }
      });
      const query = select('users' as UsersTable, all, {
        lateral: { posts: postsQuery }
      });

      const result = await query.run(pool);

      // Verify that Alice's posts have her comments
      const alice = result.find(u => u.name === 'Alice');
      expect(alice).toBeDefined();
      if (alice) {
        expect(alice.posts).toHaveLength(2);

        // Verify comments belong to the correct posts
        const post1Comments = alice.posts[0].comments;
        expect(post1Comments).toBeInstanceOf(Array);
      }
    });
  });

  describe('lateral joins - edge cases', () => {
    beforeEach(async () => {
      await insertUser(pool, { name: 'Alice', email: 'alice@example.com', age: 25 });
      await insertUser(pool, { name: 'Bob', email: 'bob@example.com', age: 30 });
    });

    it('should handle empty lateral result sets', async () => {
      // No posts exist
      const query = select('users' as UsersTable, all, {
        lateral: {
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);
      expect(result[0].posts).toEqual([]);
      expect(result[1].posts).toEqual([]);
    });

    it('should handle lateral with LIMIT on main query', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 2, title: 'Post 2', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        },
        limit: 1
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].postCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle lateral with ORDER BY on main query', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: true });
      await insertPost(pool, { user_id: 2, title: 'Post 3', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        },
        order: { by: 'name' as const, direction: 'DESC' }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Bob');
      expect(result[1].name).toBe('Alice');
    });

    it('should handle lateral subquery with LIMIT', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 2', published: true });
      await insertPost(pool, { user_id: 1, title: 'Post 3', published: true });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          recentPosts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            order: { by: 'id' as 'id' | 'user_id', direction: 'DESC' },
            limit: 2
          })
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].recentPosts).toHaveLength(2);
    });

    it('should handle lateral with WHERE clause on main query', async () => {
      await insertPost(pool, { user_id: 1, title: 'Post 1', published: true });
      await insertPost(pool, { user_id: 2, title: 'Post 2', published: true });

      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Alice');
      expect(result[0].postCount).toBe(1);
    });

    it('should handle multiple users with varying lateral results', async () => {
      await insertPost(pool, { user_id: 1, title: 'Alice Post 1', published: true });
      await insertPost(pool, { user_id: 1, title: 'Alice Post 2', published: true });
      await insertPost(pool, { user_id: 1, title: 'Alice Post 3', published: true });
      await insertPost(pool, { user_id: 2, title: 'Bob Post 1', published: true });

      const query = select('users' as UsersTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          posts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        },
        order: { by: 'name' as const, direction: 'ASC' }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[0].postCount).toBe(3);
      expect(result[0].posts).toHaveLength(3);
      expect(result[1].name).toBe('Bob');
      expect(result[1].postCount).toBe(1);
      expect(result[1].posts).toHaveLength(1);
    });
  });

  describe('lateral joins - complex real-world scenarios', () => {
    beforeEach(async () => {
      const user1 = await insertUser(pool, { name: 'Alice', email: 'alice@example.com', age: 25 });
      const user2 = await insertUser(pool, { name: 'Bob', email: 'bob@example.com', age: 30 });

      const post1 = await insertPost(pool, { user_id: user1, title: 'Alice Post 1', published: true });
      await insertPost(pool, { user_id: user1, title: 'Alice Post 2', published: false });
      const post3 = await insertPost(pool, { user_id: user2, title: 'Bob Post 1', published: true });

      await insertComment(pool, { post_id: post1, user_id: user2, content: 'Bob comment on Alice post' });
      await insertComment(pool, { post_id: post1, user_id: user1, content: 'Alice reply' });
      await insertComment(pool, { post_id: post3, user_id: user1, content: 'Alice comment on Bob post' });
    });

    it('should execute user dashboard query', async () => {
      // Real-world scenario: User dashboard showing posts, comment counts, and activity
      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        lateral: {
          publishedPosts: select('posts' as PostsTable, {
            user_id: parent('id'),
            published: true
          } as PostWhereable),
          draftPosts: select('posts' as PostsTable, {
            user_id: parent('id'),
            published: false
          } as PostWhereable),
          totalComments: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable),
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0].publishedPosts).toHaveLength(1);
      expect(result[0].draftPosts).toHaveLength(1);
      expect(result[0].totalComments).toBe(2);
      expect(result[0].postCount).toBe(2);
    });

    it('should execute pagination with lateral aggregates', async () => {
      const query = select('users' as UsersTable, all, {
        lateral: {
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          commentCount: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable)
        },
        order: { by: 'name' as const, direction: 'ASC' },
        limit: 10,
        offset: 0
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);
      expect(result[0].postCount).toBeGreaterThanOrEqual(0);
      expect(result[0].commentCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle activity feed with nested data', async () => {
      // Get users with their posts and comments on those posts
      const postsWithComments = select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
        lateral: {
          comments: select('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable),
          commentCount: count('comments' as CommentsTable, { post_id: parent('id') } as CommentWhereable)
        }
      });

      const query = select('users' as UsersTable, all, {
        lateral: {
          posts: postsWithComments
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);

      const alice = result.find(u => u.name === 'Alice');
      expect(alice).toBeDefined();
      if (alice) {
        expect(alice.posts).toHaveLength(2);
        expect(alice.posts[0].comments).toBeInstanceOf(Array);
        expect(alice.posts[0].commentCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle content statistics query', async () => {
      // Complex analytics: users with various stats
      const query = select('users' as UsersTable, all, {
        lateral: {
          totalPosts: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable),
          publishedPosts: count('posts' as PostsTable, {
            user_id: parent('id'),
            published: true
          } as PostWhereable),
          commentsGiven: count('comments' as CommentsTable, { user_id: parent('id') } as CommentWhereable),
          latestPost: selectOne('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            order: { by: 'id' as 'id' | 'user_id', direction: 'DESC' }
          })
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);

      for (const user of result) {
        expect(user.totalPosts).toBeGreaterThanOrEqual(0);
        expect(user.publishedPosts).toBeGreaterThanOrEqual(0);
        expect(user.publishedPosts).toBeLessThanOrEqual(user.totalPosts);
        expect(user.commentsGiven).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle user leaderboard query', async () => {
      // Rank users by activity
      const query = select('users' as UsersTable, all, {
        lateral: {
          activityScore: sum('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            columns: ['id' as 'id' | 'user_id']
          }),
          postCount: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        },
        order: { by: 'name' as const, direction: 'ASC' }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(2);
      expect(result[0].postCount).toBeGreaterThanOrEqual(0);
    });

    it('should handle selective data loading with multiple laterals', async () => {
      // Load only necessary data for different UI components
      const query = select('users' as UsersTable, { name: 'Alice' } as UserWhereable, {
        columns: ['id', 'name', 'email'] as ('id' | 'name' | 'email')[],
        lateral: {
          recentPosts: select('posts' as PostsTable, { user_id: parent('id') } as PostWhereable, {
            columns: ['id', 'title'] as ('id' | 'title')[],
            limit: 5,
            order: { by: 'id' as 'id' | 'user_id', direction: 'DESC' }
          }),
          stats: count('posts' as PostsTable, { user_id: parent('id') } as PostWhereable)
        }
      });

      const result = await query.run(pool);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('email');
      expect(result[0]).toHaveProperty('recentPosts');
      expect(result[0]).toHaveProperty('stats');
      expect(result[0].recentPosts.length).toBeLessThanOrEqual(5);
    });
  });
});
