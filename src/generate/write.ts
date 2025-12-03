

import * as fs from 'fs';
import * as path from 'path';
import { Config, finaliseConfig } from './config';
import { header } from './header';
import { generateBarrelContent, tsForConfig } from './tsOutput';


/**
 * Generate a schema and supporting files and folders given a configuration.
 * @param suppliedConfig An object approximately matching `sapatosconfig.json`.
 */
export const generate = async (suppliedConfig: Config) => {
  const
    config = finaliseConfig(suppliedConfig),
    log = config.progressListener === true ? console.log :
      (config.progressListener !== false ? config.progressListener : (() => void 0)),
    warn = config.warningListener === true ? console.log :
      (config.warningListener !== false ? config.warningListener : (() => void 0)),
    debug = config.debugListener === true ? console.log :
      (config.debugListener !== false ? config.debugListener : (() => void 0)),

    { ts, customTypeSourceFiles } = await tsForConfig(config, debug),

    folderName = '@architect-eng/sapatos',
    schemaName = 'schema' + config.outExt,
    customFolderName = 'custom',
    customTypesIndexName = 'index' + config.outExt,
    customTypesIndexContent = header() + `
// Re-export all custom types from this index
` + generateBarrelContent(Object.keys(customTypeSourceFiles)),

    folderTargetPath = path.join(config.outDir, folderName),
    schemaTargetPath = path.join(folderTargetPath, schemaName),
    customFolderTargetPath = path.join(folderTargetPath, customFolderName),
    customTypesIndexTargetPath = path.join(customFolderTargetPath, customTypesIndexName);

  log(`(Re)creating schema folder: ${schemaTargetPath}`);
  fs.mkdirSync(folderTargetPath, { recursive: true });

  log(`Writing generated schema: ${schemaTargetPath}`);
  fs.writeFileSync(schemaTargetPath, ts, { flag: 'w' });

  if (Object.keys(customTypeSourceFiles).length > 0) {
    fs.mkdirSync(customFolderTargetPath, { recursive: true });

    for (const customTypeFileName of Object.keys(customTypeSourceFiles).sort()) {
      const customTypeFilePath = path.join(customFolderTargetPath, customTypeFileName + config.outExt);
      if (fs.existsSync(customTypeFilePath)) {
        log(`Custom type or domain declaration file already exists: ${customTypeFilePath}`);

      } else {
        warn(`Writing new custom type or domain placeholder file: ${customTypeFilePath}`);
        const customTypeFileContent = customTypeSourceFiles[customTypeFileName];
        if (customTypeFileContent === undefined) {
          throw new Error(`No content found for custom type file: ${customTypeFileName}`);
        }
        fs.writeFileSync(customTypeFilePath, customTypeFileContent, { flag: 'w' });
      }
    }

    log(`Writing custom types file: ${customTypesIndexTargetPath}`);
    fs.writeFileSync(customTypesIndexTargetPath, customTypesIndexContent, { flag: 'w' });
  }
};
