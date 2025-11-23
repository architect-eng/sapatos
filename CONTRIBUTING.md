# Contributing to Sapatos

Thank you for your interest in contributing to Sapatos! This guide will help you understand our development workflow and commit conventions.

## Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/architect-eng/sapatos.git
   cd sapatos
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

   This will automatically set up git hooks via Husky.

3. **Run tests and linting**
   ```bash
   npm run lint   # Check code style
   npm run build  # Compile TypeScript
   npm test       # Run test suite
   ```

## Commit Message Conventions

Sapatos follows the [Conventional Commits](https://www.conventionalcommits.org/) specification. All commit messages are automatically validated using git hooks and CI.

### Commit Message Format

Each commit message consists of a **header**, an optional **body**, and an optional **footer**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

#### Header (Required)

The header is mandatory and must conform to this format:

```
<type>(<scope>): <subject>
```

- **type**: Describes the kind of change (see types below)
- **scope** (optional): Describes what part of the codebase is affected (e.g., `db`, `generate`, `types`)
- **subject**: Short description in imperative mood (e.g., "add feature" not "added feature")

#### Type (Required)

Must be one of the following:

- **feat**: A new feature for users
  ```bash
  git commit -m "feat(db): add support for composite primary keys"
  ```

- **fix**: A bug fix
  ```bash
  git commit -m "fix: correct type inference for array columns"
  ```

- **docs**: Documentation only changes
  ```bash
  git commit -m "docs: add migration guide from Zapatos"
  ```

- **style**: Changes that don't affect code meaning (whitespace, formatting)
  ```bash
  git commit -m "style: format code with prettier"
  ```

- **refactor**: Code change that neither fixes a bug nor adds a feature
  ```bash
  git commit -m "refactor(generate): simplify type generation logic"
  ```

- **perf**: Performance improvement
  ```bash
  git commit -m "perf: optimize query compilation for large schemas"
  ```

- **test**: Adding or updating tests
  ```bash
  git commit -m "test: add tests for transaction retry logic"
  ```

- **build**: Changes to build system or dependencies
  ```bash
  git commit -m "build: update TypeScript to 5.7.2"
  ```

- **ci**: Changes to CI configuration
  ```bash
  git commit -m "ci: add Node.js 24 to test matrix"
  ```

- **chore**: Other changes that don't modify src or test files
  ```bash
  git commit -m "chore: update .gitignore"
  ```

- **revert**: Reverts a previous commit
  ```bash
  git commit -m "revert: feat(db): add composite primary keys"
  ```

#### Scope (Optional)

The scope should describe the area of the codebase affected:

- `db` - Runtime database module
- `generate` - Schema generation CLI
- `types` - TypeScript type definitions
- `shortcuts` - Query shortcut functions
- `transaction` - Transaction handling
- `conditions` - WHERE clause builders
- `config` - Configuration handling
- `deps` - Dependencies

Examples:
```bash
git commit -m "feat(generate): add support for PostgreSQL domains"
git commit -m "fix(transaction): handle deadlock retry correctly"
git commit -m "docs(shortcuts): improve upsert documentation"
```

#### Subject (Required)

The subject line should:
- Use imperative, present tense: "change" not "changed" or "changes"
- Not capitalize the first letter
- Not end with a period (.)
- Be limited to 72 characters or less

✅ Good:
```bash
git commit -m "fix: prevent memory leak in connection pool"
```

❌ Bad:
```bash
git commit -m "Fixed the memory leak."
git commit -m "Fixes memory leaks in connection pool, also updates docs"
```

#### Body (Optional)

The body should:
- Use imperative, present tense
- Include motivation for the change
- Contrast with previous behavior
- Be wrapped at 72 characters

Example:
```bash
git commit -m "fix: prevent connection pool exhaustion

The connection pool was not releasing clients after query errors,
causing the pool to be exhausted over time. This adds proper error
handling to ensure clients are always returned to the pool."
```

#### Footer (Optional)

The footer can contain:
- **Breaking Changes**: Start with `BREAKING CHANGE:` followed by description
- **Issue References**: Reference GitHub issues

Example with breaking change:
```bash
git commit -m "feat!: change default isolation level to Serializable

BREAKING CHANGE: The default transaction isolation level has changed
from Read Committed to Serializable. Users who rely on the old behavior
should explicitly set isolationLevel to IsolationLevel.ReadCommitted.

Fixes #123"
```

### Breaking Changes

Breaking changes should be indicated by:
1. Adding `!` after the type/scope: `feat!:` or `feat(db)!:`
2. Including `BREAKING CHANGE:` in the footer with details

```bash
git commit -m "feat(types)!: remove deprecated Jsonable type

BREAKING CHANGE: The Jsonable type has been removed. Use JSONSelectable
instead, which provides better type safety."
```

## Development Workflow

1. **Create a feature branch**
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes**
   - Write code following existing patterns
   - Add tests for new functionality
   - Update documentation as needed

3. **Commit your changes**
   ```bash
   git commit -m "feat: add my feature"
   ```

   The git hook will automatically validate your commit message. If it fails:
   ```
   ⧗   input: bad commit message
   ✖   subject may not be empty [subject-empty]
   ✖   type may not be empty [type-empty]
   ```

   Fix your commit message and try again.

4. **Push your branch**
   ```bash
   git push origin feat/my-feature
   ```

5. **Create a Pull Request**
   - Ensure all commits follow the convention
   - CI will validate all commit messages
   - Address any review feedback

## Bypassing the Git Hook (Not Recommended)

In rare cases, you may need to bypass the commit message validation:

```bash
git commit --no-verify -m "your message"
```

⚠️ **Warning**: CI will still validate your commits in pull requests, so non-compliant commits will block merging.

## Tips for Writing Good Commits

1. **Keep commits atomic**: Each commit should represent a single logical change
2. **Write meaningful messages**: Future you will thank you
3. **Use the body**: Explain *why* not *what* (the diff shows what)
4. **Reference issues**: Link to relevant GitHub issues
5. **Group related changes**: Use the scope to organize commits

## Examples of Good Commit Messages

```bash
# Simple feature
git commit -m "feat(db): add support for JSONB operators"

# Bug fix with body
git commit -m "fix(generate): handle enum values with special characters

Enum values containing hyphens or spaces were not being properly
escaped in generated TypeScript. This adds proper quoting for all
enum values.

Fixes #456"

# Breaking change
git commit -m "feat(shortcuts)!: change upsert return type

BREAKING CHANGE: upsert now returns an array instead of a single
object for consistency with other shortcuts. Use upsertOne if you
need the old behavior.

Migration:
- Change: const user = await db.upsert(...)
- To: const [user] = await db.upsert(...)
- Or use: const user = await db.upsertOne(...)"

# Refactoring
git commit -m "refactor(transaction): extract retry logic

Moves the retry logic into a separate function for better testability
and reusability. No behavior changes."

# Documentation
git commit -m "docs: add examples for lateral joins"

# Multiple changes with scope
git commit -m "feat(db): add connection pool monitoring

- Add poolSize and activeConnections getters
- Emit events for pool state changes
- Add debug logging for connection lifecycle"
```

## Questions?

If you have questions about the contribution process or commit conventions, please:
- Check the [Conventional Commits](https://www.conventionalcommits.org/) specification
- Review existing commits for examples
- Open an issue for discussion

Thank you for contributing to Sapatos! 🚀
