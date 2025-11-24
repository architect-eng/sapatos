# Sapatos

Sapatos is a TypeScript-PostgreSQL ORM that generates type-safe database types directly from your PostgreSQL schema. It's a fork of George MacKerron's Zapatos library maintained by Architect.

## Project Commands

### Development
- `npm run lint` - Lint TypeScript source files using ESLint
- `npm run typecheck` - Type check using tsconfig.build.json and tsconfig.test.json
- `npm run build` - Compile TypeScript and generate ESM wrappers
- `npx sapatos` - Generate TypeScript types from database schema

### Testing
- `npm run test` - Run unit tests with Vitest (excludes integration tests)
- `npm run test:watch` - Run unit tests in watch mode
- `npm run test:ui` - Open Vitest UI for interactive testing
- `npm run test:coverage` - Run tests with coverage reporting
- `npm run integration-tests` - Run integration tests with PostgreSQL testcontainers
- `npm run integration-tests:watch` - Run integration tests in watch mode

**PostgreSQL Version Configuration:**
Integration tests use a configurable PostgreSQL version via the `POSTGRES_VERSION` environment variable:

```bash
# Default: PostgreSQL 17 (latest stable)
npm run integration-tests

# Test with specific version
POSTGRES_VERSION=16 npm run integration-tests

# Flexible formats supported
POSTGRES_VERSION=15 npm run integration-tests              # -> postgres:15-alpine
POSTGRES_VERSION=14-alpine npm run integration-tests       # -> postgres:14-alpine
POSTGRES_VERSION=postgres:13-alpine npm run integration-tests  # -> postgres:13-alpine
```

### Mise Tasks
[Mise](https://mise.jdx.dev/) is used for task automation and environment management. Available tasks:

- `mise run claude` - Run Claude Code CLI (passes through arguments)
- `mise run commit` - Pre-commit verification workflow
  - Runs: lint → typecheck → build → test
  - Use before committing to ensure code quality
- `mise run push` - Complete pull-commit-push workflow
  - Runs: git pull -r → mise run commit → git push
  - Validates clean working directory before pushing

### CI/CD
- GitHub Actions CI runs on Node 20.x, 22.x, 24.x
- PostgreSQL version matrix: Tests against PostgreSQL 17, 16, 15, 14, 13
- **Selective matrix strategy** (7 total jobs):
  - All PostgreSQL versions (17, 16, 15, 14, 13) on Node 22.x
  - All Node versions (20.x, 22.x, 24.x) on PostgreSQL 17
- CI workflow steps: `npm ci` → `lint` → `typecheck` → `build` → `test` → `integration-tests`
- Multiple workflows: master-ci (main pipeline), commitlint (PR validation), release (automated releases)
- Git hooks via Husky: commit-msg validation using commitlint

### Configuration
Create a `sapatosconfig.json` in your project root with database connection info and generation options. Environment variables can be interpolated using `{{ VAR_NAME }}` syntax.

Example configuration:
```json
{
  "db": {
    "host": "{{ DB_HOST }}",
    "user": "{{ DB_USER }}",
    "password": "{{ DB_PASSWORD }}",
    "database": "{{ DB_NAME }}"
  },
  "outDir": "./src",
  "schemas": {
    "public": { "include": "*", "exclude": [] }
  }
}
```

## Architecture Overview

### Two-Module System

Sapatos consists of two primary modules that work together:

1. **`@architect-eng/sapatos/db`** (Runtime Module)
   - Core SQL query building and execution
   - Transaction management with automatic retry
   - Type-safe query shortcuts (insert, update, select, delete, upsert)
   - Condition builders for WHERE clauses

2. **`@architect-eng/sapatos/generate`** (Code Generation Module)
   - CLI tool that introspects PostgreSQL schemas
   - Generates TypeScript type definitions
   - Creates type-safe interfaces for tables, views, and custom types

### Code Generation Flow

1. CLI (`src/generate/cli.ts`) reads config from `sapatosconfig.json`
2. Connects to PostgreSQL using provided credentials
3. Introspects database schema:
   - Tables, views, materialized views, foreign tables
   - Columns with types, nullability, defaults, generated columns
   - Enums and custom types
   - Unique indexes
4. Generates TypeScript types in `sapatos/schema.d.ts`:
   - Per-table namespaces with Selectable, Insertable, Updatable, Whereable types
   - Cross-table union types
   - Schema-aware type mappings
5. Creates placeholder files for custom types in `sapatos/custom/`

### Type System Architecture

Each database table gets a namespace with specialized types:
- **Selectable**: Returned from SELECT queries (TypeScript native types)
- **JSONSelectable**: JSON-serialized representation (string dates, etc.)
- **Whereable**: Types usable in WHERE clauses (includes SQLFragments)
- **Insertable**: Types for INSERT operations (includes defaults)
- **Updatable**: Types for UPDATE operations (all fields optional)

### Query Building Pattern

Uses **tagged template literals** with compile-time and runtime safety:

```typescript
const query = sql<InterpolationTypes, ReturnType>`
  SELECT * FROM users WHERE id = ${param(userId)}
`;
```

The `SQLFragment` class:
- Compiles interpolated values into parameterized queries
- Prevents SQL injection via parameter binding
- Supports nested queries and fragments
- Has `compile()` method (returns `{ text, values }`) and `run()` method (executes on pool/client)

### Transaction System

Sophisticated transaction handling in `src/db/transaction.ts`:
- Automatic retry for serialization failures and deadlocks
- Configurable isolation levels (Serializable, RepeatableRead, ReadCommitted, plus RO variants)
- Random exponential backoff between retries
- Transaction ID tracking for debugging
- Proper client pooling and release

Key features:
- Detects if passed a pool (checks out client) vs existing client (reuses)
- Retries only on specific PostgreSQL error codes (40001, 40P01)
- Cleans up `_sapatos` metadata after transaction completes

### Shortcut Query Functions

High-level operations in `src/db/shortcuts.ts`:
- **insert**: Single or batch inserts with RETURNING
- **upsert**: INSERT ... ON CONFLICT with updateColumns/noNullUpdateColumns options
- **update**: UPDATE with type-safe SET clause
- **select/selectOne/selectExactlyOne**: Flexible SELECT with lateral joins, extras, grouping
- **count/sum/avg/min/max**: Aggregate functions
- **deletes**: DELETE queries (renamed to avoid reserved word)
- **truncate**: TRUNCATE with CASCADE/RESTART IDENTITY options

All shortcuts:
- Return `SQLFragment` instances (lazy - not executed until `.run()`)
- Support `returning` option to specify returned columns
- Support `extras` option to include computed values
- Use `runResultTransform` to shape results (e.g., unwrap single row, extract count)

### Conditions Module

`src/db/conditions.ts` provides type-safe WHERE clause builders:
- Comparison: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`
- NULL checks: `isNull`, `isNotNull`
- Pattern matching: `like`, `ilike`, `reMatch`
- Array operations: `isIn`, `isNotIn`, `arrayContains`, `arrayOverlaps`
- Logic: `and`, `or`, `not`
- Range: `between`, `notBetween`
- Special: `isDistinctFrom` (NULL-safe equality)
- Uses `self` symbol to reference the current column

### Custom Types & Domains

When encountering unknown PostgreSQL types or domains:
1. Creates a prefixed type name (e.g., `PgMy_type` based on `customTypesTransform` config)
2. Generates placeholder file in `sapatos/custom/` with `any` type
3. User fills in actual TypeScript type
4. Type is referenced as `c.PgMy_type` in generated schema

This allows incremental typing of custom database types.

## Key Design Principles

1. **Zero Abstractions**: Generated types directly mirror database schema
2. **Type Safety First**: Leverage TypeScript's type system for compile-time query validation
3. **Lazy Execution**: Queries are SQLFragments until explicitly run
4. **Composability**: SQLFragments can be nested and combined
5. **PostgreSQL Native**: Embraces Postgres-specific features (LATERAL joins, UPSERT, isolation levels)
6. **Explicit Configuration**: Column behavior (optional/excluded in insert/update) is configurable

## Directory Structure

```
src/
├── db/                    # Runtime query module
│   ├── core.ts           # SQLFragment, tagged templates, symbols
│   ├── shortcuts.ts      # High-level query functions
│   ├── transaction.ts    # Transaction management with retry
│   ├── conditions.ts     # WHERE clause builders
│   ├── config.ts         # Runtime configuration
│   ├── pgErrors.ts       # PostgreSQL error handling
│   └── ...
├── generate/             # Schema generation CLI
│   ├── cli.ts           # Entry point (reads sapatosconfig.json)
│   ├── write.ts         # File system operations
│   ├── tables.ts        # Table/view introspection & type generation
│   ├── enums.ts         # Enum type handling
│   ├── pgTypes.ts       # PostgreSQL to TypeScript type mapping
│   ├── tsOutput.ts      # TypeScript code generation orchestration
│   └── config.ts        # Generation configuration
└── typings/
    └── sapatos/
        └── schema.ts    # Type definitions for generated schema

dist/                     # Compiled JavaScript output
```

## Important Files

- `package.json` - Defines `db` and `generate` dual exports, build scripts
- `tsconfig.json` - Strict TypeScript configuration
- `eslint.config.mjs` - ESLint rules (flat config format)
- `sapatosconfig.json` - User config file (not in repo, created per-project)

## Testing

Sapatos uses **Vitest 4.0.13** as its testing framework with separate configurations for unit and integration tests.

### Test Structure

**Unit Tests** (`*.test.ts`)
- Fast, isolated tests without database dependencies
- Mock database types and validate SQL query generation
- Configuration: `vitest.config.ts`
- Location: `src/**/*.test.ts` (excludes `*.integration.test.ts`)
- Example: `src/db/shortcuts.test.ts` (1,135 lines testing all shortcut functions)

**Integration Tests** (`*.integration.test.ts`)
- End-to-end tests with real PostgreSQL database
- Uses [@testcontainers/postgresql](https://www.testcontainers.com/) for isolated test environments
- Configuration: `vitest.integration.config.ts`
- Location: `src/**/*.integration.test.ts`
- Timeout: 60s for tests and hooks (allows container startup time)
- Example: `src/db/shortcuts.integration.test.ts` (370 lines testing actual database operations)

### Test Infrastructure

**Integration Test Helpers** (`src/test-helpers/integration-db.ts`):
- Spins up configurable PostgreSQL Alpine container via testcontainers
- **Default version**: PostgreSQL 17 (latest stable)
- **Configurable via**: `POSTGRES_VERSION` environment variable
- **Supported versions**: PostgreSQL 17, 16, 15, 14, 13 (and any valid postgres image)
- Global container reuse across tests for performance
- Helper functions:
  - `startTestDatabase()` - Creates/reuses container and connection pool
  - `stopTestDatabase()` - Cleans up container and connections
  - `setupTestSchema()` - Creates test tables (users, posts, comments)
  - `cleanTestSchema()` - Truncates tables between tests

### Running Tests

**Unit tests only**:
```bash
npm run test                # Run once
npm run test:watch          # Watch mode
npm run test:ui             # Interactive UI mode
npm run test:coverage       # With coverage reports
```

**Integration tests**:
```bash
npm run integration-tests           # Run once
npm run integration-tests:watch     # Watch mode
```

**All tests** (as run in CI):
```bash
npm run test && npm run integration-tests
```

**Via mise**:
```bash
mise run commit   # Runs all verifications including tests
```

### Test Configuration

**TypeScript Config** (`tsconfig.test.json`):
- Extends base tsconfig
- Includes both `*.test.ts` and `*.integration.test.ts`
- Uses ESNext modules with bundler resolution
- Relaxes some strict settings for test convenience

**Coverage**:
- Provider: V8
- Reporters: text, json, html
- Run with: `npm run test:coverage`

## Code Quality & Validation

### Always Run Before Committing

**CRITICAL**: Before committing any changes, ALWAYS run the complete validation suite:

```bash
# Full validation checklist (in order)
npm run lint              # ✅ Must pass with 0 warnings
npm run typecheck         # ✅ Must pass with no errors
npm run build             # ✅ Must compile successfully
npm run test              # ✅ All unit tests must pass
npm run integration-tests # ✅ All integration tests must pass
```

Or use the pre-commit workflow:
```bash
mise run commit  # Runs: lint → typecheck → build → test
```

### Why Each Step Matters

1. **`npm run lint`**
   - Catches code style issues, unused variables, and common mistakes
   - ESLint with strict rules and 0 warnings policy
   - Fixes many issues automatically with `--fix`

2. **`npm run typecheck`**
   - Validates TypeScript types across the entire codebase
   - Catches type errors that tests might miss
   - Uses both `tsconfig.build.json` and `tsconfig.test.json`
   - **Critical for test files**: Test files can have valid syntax but wrong types

3. **`npm run build`**
   - Ensures the code compiles to JavaScript
   - Validates that all imports/exports are correct
   - Required before publishing or deploying

4. **`npm run test`**
   - Runs unit tests
   - Fast feedback on business logic
   - Must pass before integration tests

5. **`npm run integration-tests`**
   - Runs integration tests with real PostgreSQL
   - Validates end-to-end behavior
   - Tests database interactions and schema generation

### Common Pitfalls

❌ **Don't skip typecheck** - Tests can pass but have type errors
❌ **Don't skip lint** - Code might work but violate style rules
❌ **Don't assume tests are enough** - Build and typecheck catch different issues

## Commit Conventions

This project enforces [Conventional Commits](https://www.conventionalcommits.org/) for all commit messages. Commits are validated locally via git hooks (Husky + commitlint) and in CI for pull requests.

### Format

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

- **feat**: New feature for the user
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring without changing functionality
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: Changes to CI configuration
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Examples

```bash
# Feature with scope
git commit -m "feat(db): add support for lateral joins"

# Bug fix
git commit -m "fix: correct type inference for nullable columns"

# Breaking change
git commit -m "feat!: change transaction retry behavior

BREAKING CHANGE: Transaction retry now uses exponential backoff"

# Documentation update
git commit -m "docs: update configuration examples in README"
```

### Enforcement

- **Local**: Git hooks block non-compliant commits automatically
- **CI**: Pull requests validate all commit messages
- **Bypass** (not recommended): Use `git commit --no-verify` to bypass local hook

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## References

- Original Zapatos documentation: https://jawj.github.io/zapatos/
- Repository: https://github.com/architect-eng/sapatos
