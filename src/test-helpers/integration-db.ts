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
    await globalPool.end();
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
}

/**
 * Clean all data from test tables
 */
export async function cleanTestSchema(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE users, posts RESTART IDENTITY CASCADE;');
}
