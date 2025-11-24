/**
 * Database Connection Module
 *
 * Provides factory functions for creating query functions with configurable
 * error handling and debug logging.
 *
 * Responsibilities:
 * - Create query functions with debugging capabilities
 * - Provide configurable error handling (throw vs exit)
 * - Separate debug logging from error handling
 *
 * This module enables better testability by allowing error handling to be
 * injected, while maintaining the existing function injection pattern used
 * throughout the codebase.
 */

import * as pg from 'pg';

/**
 * Options for configuring query function behavior
 */
export interface QueryFunctionOptions {
  /**
   * Called before each query executes (for debug logging)
   * @param query - The SQL query configuration
   * @param seq - Sequence number for tracking queries
   */
  onQueryStart?: (query: pg.QueryConfig, seq: number) => void;

  /**
   * Called after each query completes successfully (for debug logging)
   * @param result - The query result
   * @param seq - Sequence number matching the query start
   */
  onQueryComplete?: (result: pg.QueryResult, seq: number) => void;

  /**
   * Called when a query fails
   * If not provided, errors are re-thrown to the caller
   * @param error - The error that occurred
   * @param seq - Sequence number matching the query start
   */
  onQueryError?: (error: unknown, seq: number) => never | void;
}

/**
 * Creates a query function that wraps pg.Pool.query with configurable
 * error handling and debug logging.
 *
 * This factory function allows customization of query behavior without
 * changing the query function signature, maintaining backward compatibility
 * with existing code that expects: (q: pg.QueryConfig) => Promise<pg.QueryResult>
 *
 * @param pool - PostgreSQL connection pool
 * @param options - Configuration for debug logging and error handling
 * @returns Query function with configured behavior
 *
 * @example
 * // CLI usage with debug logging and exit on error
 * const queryFn = createQueryFunction(pool, {
 *   ...createDebugLogger(console.log),
 *   onQueryError: createExitOnErrorHandler()
 * });
 *
 * @example
 * // Test usage with standard error propagation
 * const queryFn = createQueryFunction(pool);
 * // Errors are thrown and can be caught by test framework
 */
export function createQueryFunction(
  pool: pg.Pool,
  options: QueryFunctionOptions = {}
): (query: pg.QueryConfig) => Promise<pg.QueryResult> {
  let querySeq = 0;

  return async (query: pg.QueryConfig): Promise<pg.QueryResult> => {
    const seq = querySeq++;

    try {
      // Call debug hook before query execution
      options.onQueryStart?.(query, seq);

      // Execute the query
      const result = await pool.query(query);

      // Call debug hook after successful query
      options.onQueryComplete?.(result, seq);

      return result;
    } catch (error) {
      // Call error handler if provided
      if (options.onQueryError) {
        options.onQueryError(error, seq);
        // If onQueryError returns (doesn't throw/exit), re-throw
        throw error;
      }

      // No error handler provided, re-throw to caller
      throw error;
    }
  };
}

/**
 * Creates debug logging hooks for query execution.
 *
 * These hooks log query text, parameters, and results in a readable format
 * suitable for CLI debugging.
 *
 * @param debug - Debug output function (e.g., console.log)
 * @returns Object with onQueryStart and onQueryComplete hooks
 *
 * @example
 * const queryFn = createQueryFunction(pool, {
 *   ...createDebugLogger(console.log)
 * });
 */
export function createDebugLogger(
  debug: (s: string) => void
): {
  onQueryStart: (query: pg.QueryConfig, seq: number) => void;
  onQueryComplete: (result: pg.QueryResult, seq: number) => void;
} {
  return {
    onQueryStart: (query: pg.QueryConfig, seq: number) => {
      const cleanedText = query.text.replace(/^\s+|\s+$/gm, '');
      const params = JSON.stringify(query.values);
      debug(`>>> query ${String(seq)} >>>\n${cleanedText}\n+ ${params}\n`);
    },

    onQueryComplete: (result: pg.QueryResult, seq: number) => {
      const resultJson = JSON.stringify(result, null, 2);
      debug(`<<< result ${String(seq)} <<<\n${resultJson}\n`);
    },
  };
}

/**
 * Creates an error handler that logs the error and exits the process.
 *
 * This is the default behavior for CLI usage where query failures should
 * terminate the program. For test environments, omit this handler to allow
 * errors to be thrown and caught by the test framework.
 *
 * @returns Error handler function that exits process with code 1
 *
 * @example
 * // CLI usage
 * const queryFn = createQueryFunction(pool, {
 *   onQueryError: createExitOnErrorHandler()
 * });
 *
 * @example
 * // Test usage (no exit handler)
 * const queryFn = createQueryFunction(pool);
 * try {
 *   await queryFn(badQuery);
 * } catch (error) {
 *   // Error can be caught and tested
 * }
 */
export function createExitOnErrorHandler(): (error: unknown, seq: number) => never {
  return (error: unknown, seq: number): never => {
    console.log(`*** error ${String(seq)} ***`, error);
    process.exit(1);
  };
}
