// Configuration
export * from './config';

// Enum generation
export * from './enums';

// Header generation
export { header } from './header';

// Type mapping
export * from './pgTypes';

// Table generation
export * from './tables';

// TypeScript output generation
export * from './tsOutput';

// File system operations
export * from './write';

// Note: cli.ts is NOT exported here because it has side effects (runs CLI when imported)
// Import directly from '@architect-eng/sapatos/generate/cli' if needed for testing
