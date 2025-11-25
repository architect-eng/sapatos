import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as ts from 'typescript';

export interface TypeCheckResult {
  success: boolean;
  diagnostics: ts.Diagnostic[];
  formattedDiagnostics: string;
  errorCount: number;
}

export interface TempProject {
  rootDir: string;
  schemaDir: string;
  schemaPath: string;
  cleanup: () => void;
}

const TSCONFIG_CONTENT: ts.CompilerOptions = {
  target: ts.ScriptTarget.ES2019,
  module: ts.ModuleKind.CommonJS,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  esModuleInterop: true,
  declaration: false,
};

function getProjectRoot(): string {
  // Navigate from src/test-helpers to project root
  return path.resolve(__dirname, '../..');
}

function setupPackageSymlinks(targetDir: string): void {
  const projectRoot = getProjectRoot();
  const nodeModulesPath = path.join(targetDir, 'node_modules', '@architect-eng', 'sapatos');
  fs.mkdirSync(nodeModulesPath, { recursive: true });

  // Symlink the entire dist directory for complete type resolution
  const distSource = path.join(projectRoot, 'dist');
  const distTarget = path.join(nodeModulesPath, 'dist');

  // Use junction on Windows, symlink elsewhere
  const symlinkType = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(distSource, distTarget, symlinkType);

  // Create db.d.ts shim that re-exports from dist/db
  // This mirrors the project's db.d.ts shim
  const dbDtsContent = `export * from './dist/db';\n`;
  fs.writeFileSync(path.join(nodeModulesPath, 'db.d.ts'), dbDtsContent);

  // Create package.json for module resolution
  const packageJson = {
    name: '@architect-eng/sapatos',
    version: '0.0.0',
    main: './dist/db/index.js',
    types: './db.d.ts',
  };
  fs.writeFileSync(
    path.join(nodeModulesPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );
}

export function createTempProject(
  schemaContent: string,
  customTypeFiles: Record<string, string>
): TempProject {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sapatos-typecheck-'));

  // Create @architect-eng/sapatos directory for schema
  const schemaDir = path.join(rootDir, '@architect-eng', 'sapatos');
  fs.mkdirSync(schemaDir, { recursive: true });

  // Write generated schema
  const schemaPath = path.join(schemaDir, 'schema.ts');
  fs.writeFileSync(schemaPath, schemaContent);

  // Write custom type files if any
  if (Object.keys(customTypeFiles).length > 0) {
    const customDir = path.join(schemaDir, 'custom');
    fs.mkdirSync(customDir, { recursive: true });

    for (const [name, content] of Object.entries(customTypeFiles)) {
      fs.writeFileSync(path.join(customDir, `${name}.ts`), content);
    }

    // Barrel file
    const barrelContent =
      Object.keys(customTypeFiles)
        .map((name) => `export * from './${name}';`)
        .join('\n') + '\n';
    fs.writeFileSync(path.join(customDir, 'index.ts'), barrelContent);
  }

  // Setup symlinks for @architect-eng/sapatos/db
  setupPackageSymlinks(rootDir);

  // Write tsconfig.json
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  const tsconfigJson = {
    compilerOptions: {
      target: 'ES2019',
      module: 'CommonJS',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      moduleResolution: 'node',
      esModuleInterop: true,
      declaration: false,
      baseUrl: '.',
      paths: {
        '@architect-eng/sapatos/db': ['./node_modules/@architect-eng/sapatos/db.d.ts'],
      },
    },
    include: ['**/*.ts'],
    exclude: ['node_modules/@architect-eng/sapatos/dist/**/*.ts'],
  };
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfigJson, null, 2));

  const shouldKeep = process.env['SAPATOS_KEEP_TEMP'] === '1';

  return {
    rootDir,
    schemaDir,
    schemaPath,
    cleanup: () => {
      if (!shouldKeep) {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } else {
        console.log(`Keeping temp directory: ${rootDir}`);
      }
    },
  };
}

export function typecheckFiles(rootDir: string, files: string[]): TypeCheckResult {
  const formatHost: ts.FormatDiagnosticsHost = {
    getCanonicalFileName: (f) => f,
    getCurrentDirectory: () => rootDir,
    getNewLine: () => '\n',
  };

  // Read tsconfig if present
  const configPath = path.join(rootDir, 'tsconfig.json');
  let compilerOptions = TSCONFIG_CONTENT;

  if (fs.existsSync(configPath)) {
    const configFile = ts.readConfigFile(configPath, (path) => ts.sys.readFile(path));
    if (!configFile.error) {
      const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, rootDir);
      compilerOptions = parsedConfig.options;
    }
  }

  const program = ts.createProgram({
    rootNames: files,
    options: compilerOptions,
  });

  const allDiagnostics = [
    ...program.getSemanticDiagnostics(),
    ...program.getSyntacticDiagnostics(),
    ...program.getDeclarationDiagnostics(),
  ];

  // Filter out errors from node_modules (except unused @ts-expect-error which we care about)
  const filteredDiagnostics = allDiagnostics.filter((d) => {
    const fileName = d.file?.fileName ?? '';
    // Allow TS2578 (unused @ts-expect-error) from anywhere
    if (d.code === 2578) return true;
    // Filter out other errors from node_modules
    return !fileName.includes('node_modules');
  });

  return {
    success: filteredDiagnostics.length === 0,
    diagnostics: filteredDiagnostics,
    formattedDiagnostics: ts.formatDiagnosticsWithColorAndContext(filteredDiagnostics, formatHost),
    errorCount: filteredDiagnostics.length,
  };
}

export function writeUsageFile(project: TempProject, code: string): string {
  const usagePath = path.join(project.rootDir, 'usage.ts');
  fs.writeFileSync(usagePath, code);
  return usagePath;
}

/**
 * Helper to check if typechecking passed, with detailed error output on failure.
 * Returns the result for further inspection if needed.
 */
export function expectTypeCheckSuccess(result: TypeCheckResult): void {
  if (!result.success) {
    console.error('TypeScript compilation errors:\n', result.formattedDiagnostics);
  }
}

/**
 * Helper to verify that certain @ts-expect-error directives were consumed.
 * This ensures that expected type errors actually occurred.
 *
 * If any @ts-expect-error directive is "unused" (TS2578), it means the code
 * didn't produce the expected error - indicating a type safety issue.
 */
export function hasUnusedExpectError(result: TypeCheckResult): boolean {
  return result.diagnostics.some((d) => d.code === 2578);
}

/**
 * Get all unused @ts-expect-error diagnostics for detailed error messages
 */
export function getUnusedExpectErrors(result: TypeCheckResult): ts.Diagnostic[] {
  return result.diagnostics.filter((d) => d.code === 2578);
}
