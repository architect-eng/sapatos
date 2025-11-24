import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';

export interface TestDatabase {
  pool: Pool;
  container: StartedPostgreSqlContainer;
}

let globalContainer: StartedPostgreSqlContainer | null = null;
let globalPool: Pool | null = null;

/**
 * Start a PostgreSQL container for integration tests
 * Reuses the same container across all tests for performance
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  if (!globalContainer) {
    console.log('Starting PostgreSQL container...');
    globalContainer = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_pass')
      .start();
    console.log('PostgreSQL container started');
  }

  if (!globalPool) {
    globalPool = new Pool({
      host: globalContainer.getHost(),
      port: globalContainer.getPort(),
      database: globalContainer.getDatabase(),
      user: globalContainer.getUsername(),
      password: globalContainer.getPassword(),
    });

    // Register error handler to suppress expected shutdown errors
    // Error code 57P01: "terminating connection due to administrator command"
    // This prevents unhandled errors when the container is stopped
    globalPool.on('error', (err) => {
      const code = 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === '57P01' || code === 'ECONNREFUSED') {
        console.log('Expected connection error during cleanup');
      } else {
        console.error('Unexpected pool error:', err);
      }
    });
  }

  return {
    pool: globalPool,
    container: globalContainer,
  };
}

/**
 * Clean up test database connections
 */
export async function stopTestDatabase(): Promise<void> {
  if (globalPool) {
    try {
      await globalPool.end();
    } catch (err) {
      console.log('Pool cleanup error (expected during shutdown):', err instanceof Error ? err.message : String(err));
    }
    globalPool = null;
  }

  if (globalContainer) {
    console.log('Stopping PostgreSQL container...');
    await globalContainer.stop();
    globalContainer = null;
    console.log('PostgreSQL container stopped');
  }
}

/**
 * Create a test schema with basic tables for testing
 */
export async function setupTestSchema(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      age INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

/**
 * Clean all data from test tables
 */
export async function cleanTestSchema(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE users, posts, comments RESTART IDENTITY CASCADE;');
}

/**
 * Helper: Insert a user and return the ID
 */
export async function insertUser(
  pool: Pool,
  data: { name: string; email: string; age?: number }
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    'INSERT INTO users (name, email, age) VALUES ($1, $2, $3) RETURNING id',
    [data.name, data.email, data.age ?? null]
  );
  if (!result.rows[0]) throw new Error('Failed to insert user');
  return result.rows[0].id;
}

/**
 * Helper: Insert a post and return the ID
 */
export async function insertPost(
  pool: Pool,
  data: { user_id: number; title: string; content?: string; published?: boolean }
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    'INSERT INTO posts (user_id, title, content, published) VALUES ($1, $2, $3, $4) RETURNING id',
    [data.user_id, data.title, data.content ?? null, data.published ?? false]
  );
  if (!result.rows[0]) throw new Error('Failed to insert post');
  return result.rows[0].id;
}

/**
 * Helper: Insert a comment and return the ID
 */
export async function insertComment(
  pool: Pool,
  data: { post_id: number; user_id: number; content: string }
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    'INSERT INTO comments (post_id, user_id, content) VALUES ($1, $2, $3) RETURNING id',
    [data.post_id, data.user_id, data.content]
  );
  if (!result.rows[0]) throw new Error('Failed to insert comment');
  return result.rows[0].id;
}
