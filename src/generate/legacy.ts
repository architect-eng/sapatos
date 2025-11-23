

import * as fs from 'fs';
import * as path from 'path';
import { CompleteConfig } from "./config";


const recurseNodes = (node: string): string[] =>
  fs.statSync(node).isFile() ? [node] :
    fs.readdirSync(node).reduce<string[]>((memo, n) =>
      memo.concat(recurseNodes(path.join(node, n))), []);

export function srcWarning(config: CompleteConfig) {
  if (config.outExt === '.ts') return;  // if .ts extension is explicitly set, our legacy detection code fails

  const
    legacyFolderName = 'sapatos',
    legacyFolderPath = path.join(config.outDir, legacyFolderName),
    legacySchemaName = 'schema.ts',
    legacySchemaPath = path.join(legacyFolderPath, legacySchemaName),
    legacySchemaExists = fs.existsSync(legacySchemaPath),
    legacySrcName = 'src',
    legacySrcPath = path.join(legacyFolderPath, legacySrcName),
    legacySrcExists = fs.existsSync(legacySrcPath),
    legacyCustomName = 'custom',
    legacyCustomPath = path.join(legacyFolderPath, legacyCustomName),
    legacyCustomPathExists = fs.existsSync(legacyCustomPath),
    legacyCustomTypes = !legacyCustomPathExists ? [] :
      recurseNodes(legacyCustomPath).filter(f => !f.match(/[.]d[.]ts$/)),
    legacyCustomTypesExist = legacyCustomTypes.length > 0;

  if (legacySchemaExists || legacySrcExists || legacyCustomTypesExist) {
    const warn = config.warningListener === true ? console.log :
      config.warningListener || (() => void 0);

    warn(`
*** IMPORTANT: SAPATOS NO LONGER COPIES ITS SOURCE TO YOUR SOURCE TREE ***

To convert your codebase, please do the following:

* Make sure sapatos is a "dependency" (not merely a "devDependency") in your npm
  'package.json'

* Remove the "srcMode" key, if present, from 'sapatosconfig.json' or the config
  argument passed to 'generate'
` +
      (legacySchemaExists ? `
* Delete the file 'sapatos/schema.ts' (but leave 'sapatos/schema.d.ts')
` : ``) +
      (legacySrcExists ? `
* Delete the folder 'sapatos/src' and all its contents
` : ``) +
      (legacyCustomTypesExist ? `
* Transfer any customised type declarations in 'sapatos/custom' from the plain
  old '.ts' files to the new '.d.ts' files

* Delete all the plain '.ts' files in 'sapatos/custom', including 'index.ts'
` : ``) + `
* Ensure that the '.d.ts' files in 'sapatos' are picked up by your TypeScript
  configuration (e.g. check the "files" or "include" key in 'tsconfig.json')

* If you use 'ts-node' or 'node -r ts-node/register', pass the --files option
  ('ts-node' only) or set 'TS_NODE_FILES=true' (in either case)

* Make the following changes to your imports (you can use VS Code's 'Replace in
  Files' command, remembering to toggle Regular Expressions on):

   1) Change:  import * as sapatos from 'sapatos'
      To:      import * as sapatos from 'sapatos/generate'

      Search:  ^(\\s*import[^"']*['"])sapatos(["'])
      Replace: $1sapatos/generate$2

   2) Change:  import * as db from './path/to/sapatos/src'
      To:      import * as db from 'sapatos/db'

      Search:  ^(\\s*import[^"']*['"])[^"']*/sapatos/src(["'])
      Replace: $1sapatos/db$2

   3) Change:  import * as s from './path/to/sapatos/schema'
      To:      import type * as s from 'sapatos/schema'
                      ^^^^
                      be sure to import type, not just import

      Search:  ^(\\s*import\\s*)(type\\s*)?([^"']*['"])[^"']*/(sapatos/schema["'])
      Replace: $1type $3$4

Thank you.
`);
  }
}
