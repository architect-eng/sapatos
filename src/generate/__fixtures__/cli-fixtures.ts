/**
 * Valid configuration JSON strings for testing CLI config loading.
 */
export const validConfigs = {
  minimal: '{}',
  withDb: JSON.stringify({
    db: {
      host: '{{ DB_HOST }}',
      user: 'test',
      password: 'secret',
      database: 'mydb',
    },
  }),
  withEnvVars: JSON.stringify({
    db: {
      host: '{{ DB_HOST }}',
      port: '{{ DB_PORT }}',
      user: '{{ DB_USER }}',
      password: '{{ DB_PASS }}',
      database: '{{ DB_NAME }}',
    },
  }),
  complete: JSON.stringify({
    db: {
      host: 'localhost',
      user: 'test',
      password: 'secret',
      database: 'mydb',
    },
    outDir: './src',
    schemas: {
      public: { include: '*', exclude: [] },
      auth: { include: '*', exclude: ['migrations'] },
    },
  }),
};

/**
 * Invalid configuration JSON strings for testing error handling.
 */
export const invalidConfigs = {
  malformedJson: '{\"db\":',
  missingEnvVar: JSON.stringify({
    db: { host: '{{ MISSING_VAR }}' },
  }),
  wrongType: '[\"not\", \"an\", \"object\"]',
  trailingComma: '{\"db\": {},}',
};

/**
 * Environment variable test data.
 */
export const testEnvVars = {
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_USER: 'admin',
  DB_PASS: 'secret123',
  DB_NAME: 'testdb',
  CUSTOM_VAR: 'custom_value',
};
