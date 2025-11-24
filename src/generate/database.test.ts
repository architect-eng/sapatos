/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
import type * as pg from 'pg';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createQueryFunction,
  createDebugLogger,
  createExitOnErrorHandler,
} from './database';

describe('database Module', () => {
  describe('createQueryFunction', () => {
    let mockPool: pg.Pool;
    let mockQuery: pg.QueryConfig;

    beforeEach(() => {
      mockQuery = {
        text: 'SELECT * FROM users WHERE id = $1',
        values: [123],
      };

      mockPool = {
        query: vi.fn().mockResolvedValue({ rows: [{ id: 123, name: 'test' }], rowCount: 1 }),
      } as unknown as pg.Pool;
    });

    it('returns async function that wraps pool.query', async () => {
      const queryFn = createQueryFunction(mockPool);
      const result = await queryFn(mockQuery);

      expect(result).toEqual({ rows: [{ id: 123, name: 'test' }], rowCount: 1 });
      expect(mockPool.query).toHaveBeenCalledWith(mockQuery);
    });

    it('increments query sequence number for each query', async () => {
      const onQueryStart = vi.fn();
      const queryFn = createQueryFunction(mockPool, { onQueryStart });

      await queryFn(mockQuery);
      await queryFn(mockQuery);
      await queryFn(mockQuery);

      expect(onQueryStart).toHaveBeenCalledTimes(3);
      expect(onQueryStart).toHaveBeenNthCalledWith(1, mockQuery, 0);
      expect(onQueryStart).toHaveBeenNthCalledWith(2, mockQuery, 1);
      expect(onQueryStart).toHaveBeenNthCalledWith(3, mockQuery, 2);
    });

    it('calls onQueryStart before query execution', async () => {
      const onQueryStart = vi.fn();
      const queryFn = createQueryFunction(mockPool, { onQueryStart });

      await queryFn(mockQuery);

      expect(onQueryStart).toHaveBeenCalledWith(mockQuery, 0);
      expect(onQueryStart).toHaveBeenCalledBefore(mockPool.query as any);
    });

    it('calls onQueryComplete after successful query', async () => {
      const onQueryComplete = vi.fn();
      const queryFn = createQueryFunction(mockPool, { onQueryComplete });

      const result = await queryFn(mockQuery);

      expect(onQueryComplete).toHaveBeenCalledWith(result, 0);
    });

    it('calls onQueryError on query failure', async () => {
      const error = new Error('Query failed');
      mockPool.query = vi.fn().mockRejectedValue(error);
      const onQueryError = vi.fn();
      const queryFn = createQueryFunction(mockPool, { onQueryError });

      try {
        await queryFn(mockQuery);
      } catch {
        // Expected to throw
      }

      expect(onQueryError).toHaveBeenCalledWith(error, 0);
    });

    it('re-throws error after onQueryError if it returns', async () => {
      const error = new Error('Query failed');
      mockPool.query = vi.fn().mockRejectedValue(error);
      const onQueryError = vi.fn(); // Returns normally (doesn't throw)
      const queryFn = createQueryFunction(mockPool, { onQueryError });

      await expect(queryFn(mockQuery)).rejects.toThrow('Query failed');
    });

    it('propagates error when no onQueryError provided', async () => {
      const error = new Error('Query failed');
      mockPool.query = vi.fn().mockRejectedValue(error);
      const queryFn = createQueryFunction(mockPool);

      await expect(queryFn(mockQuery)).rejects.toThrow('Query failed');
    });

    it('works without any options (minimal usage)', async () => {
      const queryFn = createQueryFunction(mockPool);
      const result = await queryFn(mockQuery);

      expect(result).toEqual({ rows: [{ id: 123, name: 'test' }], rowCount: 1 });
    });

    it('passes sequence number to all hooks', async () => {
      const onQueryStart = vi.fn();
      const onQueryComplete = vi.fn();
      const queryFn = createQueryFunction(mockPool, { onQueryStart, onQueryComplete });

      await queryFn(mockQuery);

      expect(onQueryStart).toHaveBeenCalledWith(mockQuery, 0);
      expect(onQueryComplete).toHaveBeenCalledWith(expect.anything(), 0);
    });
  });

  describe('createDebugLogger', () => {
    it('returns onQueryStart and onQueryComplete hooks', () => {
      const debug = vi.fn();
      const logger = createDebugLogger(debug);

      expect(logger).toHaveProperty('onQueryStart');
      expect(logger).toHaveProperty('onQueryComplete');
      expect(typeof logger.onQueryStart).toBe('function');
      expect(typeof logger.onQueryComplete).toBe('function');
    });

    it('logs query text and parameters on start', () => {
      const debug = vi.fn();
      const { onQueryStart } = createDebugLogger(debug);

      const query = {
        text: 'SELECT * FROM users WHERE id = $1',
        values: [123],
      };

      onQueryStart(query, 5);

      expect(debug).toHaveBeenCalled();
      const output = debug.mock.calls[0][0];
      expect(output).toContain('>>> query 5 >>>');
      expect(output).toContain('SELECT * FROM users WHERE id = $1');
      expect(output).toContain('[123]');
    });

    it('logs result JSON on complete', () => {
      const debug = vi.fn();
      const { onQueryComplete } = createDebugLogger(debug);

      const result = {
        rows: [{ id: 123, name: 'test' }],
        rowCount: 1,
        command: 'SELECT',
        oid: 0,
        fields: [],
      };

      onQueryComplete(result, 5);

      expect(debug).toHaveBeenCalled();
      const output = debug.mock.calls[0][0];
      expect(output).toContain('<<< result 5 <<<');
      expect(output).toContain('"id": 123');
      expect(output).toContain('"name": "test"');
    });

    it('includes sequence number in all logs', () => {
      const debug = vi.fn();
      const logger = createDebugLogger(debug);

      const query = { text: 'SELECT 1', values: [] };
      const result = { rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] };

      logger.onQueryStart(query, 42);
      logger.onQueryComplete(result, 42);

      expect(debug).toHaveBeenCalledTimes(2);
      expect(debug.mock.calls[0][0]).toContain('query 42');
      expect(debug.mock.calls[1][0]).toContain('result 42');
    });

    it('cleans whitespace from query text', () => {
      const debug = vi.fn();
      const { onQueryStart } = createDebugLogger(debug);

      const query = {
        text: '  \n  SELECT * FROM users  \n  WHERE id = $1  \n  ',
        values: [1],
      };

      onQueryStart(query, 0);

      const output = debug.mock.calls[0][0];
      // Should trim leading/trailing whitespace per line
      expect(output).toContain('SELECT * FROM users');
      expect(output).toContain('WHERE id = $1');
    });
  });

  describe('createExitOnErrorHandler', () => {
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      mockExit.mockRestore();
      mockConsoleLog.mockRestore();
    });

    it('logs error to console', () => {
      const errorHandler = createExitOnErrorHandler();
      const error = new Error('Database connection failed');

      try {
        errorHandler(error, 5);
      } catch {
        // May throw or exit
      }

      expect(mockConsoleLog).toHaveBeenCalledWith('*** error 5 ***', error);
    });

    it('calls process.exit(1)', () => {
      const errorHandler = createExitOnErrorHandler();
      const error = new Error('Query failed');

      try {
        errorHandler(error, 0);
      } catch {
        // May throw or exit
      }

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('has return type: never', () => {
      const errorHandler = createExitOnErrorHandler();
      // TypeScript type check - the return type should be 'never'
      // This ensures it's clear the function doesn't return normally
      const _typeCheck: (error: unknown, seq: number) => never = errorHandler;
      expect(_typeCheck).toBe(errorHandler);
    });
  });
});
