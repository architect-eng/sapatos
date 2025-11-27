import { Pool } from 'pg';

/**
 * Create a comprehensive test schema for code generation testing.
 * Includes various PostgreSQL features to test type mapping.
 */
export async function setupGenerateTestSchema(pool: Pool): Promise<void> {
  // Create enums
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM ('active', 'inactive', 'pending');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create domain type
  await pool.query(`
    DO $$ BEGIN
      CREATE DOMAIN email_address AS TEXT
        CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$');
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create recursive domain types (domain based on domain)
  // This tests the full domain chain resolution: user_age -> positive_int -> integer
  await pool.query(`
    DO $$ BEGIN
      CREATE DOMAIN positive_int AS INTEGER CHECK (VALUE > 0);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      CREATE DOMAIN user_age AS positive_int CHECK (VALUE < 150);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create a composite type similar to typeid for testing baseTypeMappings
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE test_composite AS (prefix varchar(63), uuid uuid);
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create domains based on the composite type
  await pool.query(`
    DO $$ BEGIN
      CREATE DOMAIN entity_id AS test_composite;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  await pool.query(`
    DO $$ BEGIN
      CREATE DOMAIN other_entity_id AS test_composite;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;
  `);

  // Create tables with various column types
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email email_address NOT NULL UNIQUE,
      status user_status DEFAULT 'pending',
      age INTEGER,
      user_age user_age,
      balance NUMERIC(10, 2),
      big_number BIGINT,
      is_admin BOOLEAN DEFAULT FALSE,
      metadata JSONB,
      avatar BYTEA,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMP,
      birth_date DATE,
      work_hours TIME,
      tags TEXT[],
      scores INTEGER[],
      email_addresses email_address[]
    );
  `);

  // Create table with all nullable columns
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_nullable_table (
      id SERIAL PRIMARY KEY,
      optional_text TEXT,
      optional_int INTEGER,
      optional_bool BOOLEAN
    );
  `);

  // Create table with generated columns
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_computed (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      full_name TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED
    );
  `);

  // Create view
  await pool.query(`
    CREATE OR REPLACE VIEW test_user_summary AS
    SELECT id, name, status, created_at FROM test_users;
  `);

  // Create materialized view
  await pool.query(`
    DROP MATERIALIZED VIEW IF EXISTS test_user_stats;
    CREATE MATERIALIZED VIEW test_user_stats AS
    SELECT
      status,
      COUNT(*) as user_count,
      AVG(age) as avg_age
    FROM test_users
    GROUP BY status;
  `);

  // Create a simpler materialized view for testing domain resolution
  // This directly selects domain columns without aggregation
  await pool.query(`
    DROP MATERIALIZED VIEW IF EXISTS test_user_domains_mview;
    CREATE MATERIALIZED VIEW test_user_domains_mview AS
    SELECT id, email, user_age FROM test_users;
  `);

  // Create table with unique indexes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_with_indexes (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_code ON test_with_indexes(code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_category_name ON test_with_indexes(category, name);
  `);

  // Create table using composite-based domains for testing baseTypeMappings
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_entities (
      id SERIAL PRIMARY KEY,
      entity_id entity_id NOT NULL,
      other_entity_id other_entity_id,
      related_ids entity_id[]
    );
  `);

  // Create table with special column names
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "test with spaces" (
      id SERIAL PRIMARY KEY,
      "column with spaces" TEXT,
      "123numeric_start" TEXT,
      "has-dashes" TEXT
    );
  `);

  // Add column comments
  await pool.query(`
    COMMENT ON COLUMN test_users.email IS 'User primary email address';
    COMMENT ON COLUMN test_users.metadata IS 'Arbitrary JSON data for extensibility';
  `);
}

/**
 * Clean up test schema
 */
export async function cleanGenerateTestSchema(pool: Pool): Promise<void> {
  await pool.query('DROP MATERIALIZED VIEW IF EXISTS test_user_domains_mview CASCADE;');
  await pool.query('DROP MATERIALIZED VIEW IF EXISTS test_user_stats CASCADE;');
  await pool.query('DROP VIEW IF EXISTS test_user_summary CASCADE;');
  await pool.query('DROP TABLE IF EXISTS "test with spaces" CASCADE;');
  await pool.query('DROP TABLE IF EXISTS test_with_indexes CASCADE;');
  await pool.query('DROP TABLE IF EXISTS test_entities CASCADE;');
  await pool.query('DROP TABLE IF EXISTS test_computed CASCADE;');
  await pool.query('DROP TABLE IF EXISTS test_nullable_table CASCADE;');
  await pool.query('DROP TABLE IF EXISTS test_users CASCADE;');
  await pool.query('DROP DOMAIN IF EXISTS other_entity_id CASCADE;');
  await pool.query('DROP DOMAIN IF EXISTS entity_id CASCADE;');
  await pool.query('DROP DOMAIN IF EXISTS user_age CASCADE;');
  await pool.query('DROP DOMAIN IF EXISTS positive_int CASCADE;');
  await pool.query('DROP DOMAIN IF EXISTS email_address CASCADE;');
  await pool.query('DROP TYPE IF EXISTS test_composite CASCADE;');
  await pool.query('DROP TYPE IF EXISTS priority_level CASCADE;');
  await pool.query('DROP TYPE IF EXISTS user_status CASCADE;');
}
