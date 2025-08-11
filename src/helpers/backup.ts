import { readFile, writeFile, access } from 'fs/promises';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import type { 
  BackupManifest, 
  BackupFileRecord, 
  BackupVersion, 
  BackupOptions, 
  BackupResult
} from '../types/backup';
import { findConfigFiles } from './discovery';
import { parseConfigFile } from './parse';
import { generateJsonPatch, applyPatches } from './diff';

export function hashContent(content: any): string {
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
  return createHash('sha256').update(contentStr).digest('hex');
}

export async function loadBackup(backupPath: string): Promise<BackupManifest | null> {
  try {
    await access(backupPath);
    const content = await readFile(backupPath, 'utf-8');
    const data = JSON.parse(content);
    
    if (data.encrypted) {
      throw new Error('Backup is encrypted. Use decryption functionality to load.');
    }
    
    return data as BackupManifest;
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function saveBackup(manifest: BackupManifest, backupPath: string): Promise<void> {
  const content = JSON.stringify(manifest, null, 2);
  await writeFile(backupPath, content, 'utf-8');
}

export async function ensureGitIgnore(backupPath: string, encrypted: boolean): Promise<void> {
  if (encrypted) {
    console.log('💡 Backup is encrypted and safe to commit if desired');
    console.log('   Add to .gitignore if you prefer not to track it');
    return;
  }

  const gitignorePath = join(process.cwd(), '.gitignore');
  const backupFileName = backupPath.split('/').pop() || 'configrep.backup.json';
  
  try {
    let gitignoreContent = '';
    try {
      gitignoreContent = await readFile(gitignorePath, 'utf-8');
    } catch {
      // .gitignore doesn't exist, will create it
    }
    
    if (!gitignoreContent.includes(backupFileName)) {
      const newContent = gitignoreContent.trim() + '\n\n# ConfiGREP backup (unencrypted)\n' + backupFileName + '\n';
      await writeFile(gitignorePath, newContent, 'utf-8');
      console.log(`⚠️  Added ${backupFileName} to .gitignore (unencrypted)`);
    }
  } catch (error) {
    console.warn(`Warning: Could not update .gitignore: ${error}`);
  }
}

export async function reconstructAtVersion(
  fileRecord: BackupFileRecord, 
  targetVersion: number
): Promise<any> {
  if (targetVersion < 1 || targetVersion > fileRecord.versions.length) {
    throw new Error(`Invalid version ${targetVersion}. Available versions: 1-${fileRecord.versions.length}`);
  }

  const version = fileRecord.versions.find(v => v.versionNumber === targetVersion);
  if (!version) {
    throw new Error(`Version ${targetVersion} not found`);
  }

  if (version.content !== undefined) {
    return version.content;
  }

  const firstVersion = fileRecord.versions[0];
  if (!firstVersion || firstVersion.content === undefined) {
    throw new Error('No initial content found in version 1');
  }
  
  let result = firstVersion.content;

  for (let i = 1; i < targetVersion; i++) {
    const currentVersion = fileRecord.versions[i];
    if (currentVersion && currentVersion.changes) {
      result = applyPatches(result, currentVersion.changes);
    }
  }

  return result;
}

export async function createBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const {
    directory = process.cwd(),
    ignore = [],
    depth = 5,
    output = 'configrep.backup.json',
    dryRun = false
  } = options;

  const backupPath = resolve(directory, output);
  
  try {
    const configFiles = await findConfigFiles(
      directory,
      directory,
      [
        '.env', '.env.local', '.env.development', '.env.production', '.env.test',
        'config.json', 'package.json', 'tsconfig.json', 'appsettings.json',
        'config.yaml', 'config.yml', '.eslintrc.json', '.prettierrc.json',
        'config.toml', 'pyproject.toml', 'Cargo.toml',
        'config.ini', '.gitconfig', 'docker-compose.yml', 'docker-compose.yaml',
        '.babelrc', '.babelrc.json', 'babel.config.json',
        'jest.config.json', 'vitest.config.json'
      ],
      depth,
      [...ignore, output] // Exclude the backup file itself
    );

    if (configFiles.length === 0) {
      return {
        success: false,
        backupPath,
        filesProcessed: 0,
        changesDetected: 0,
        encrypted: false,
        error: 'No config files found'
      };
    }

    const existingBackup = await loadBackup(backupPath);
    const now = new Date().toISOString();
    let changesDetected = 0;

    const manifest: BackupManifest = existingBackup || {
      version: "1.0.0",
      created: now,
      lastModified: now,
      files: []
    };

    manifest.lastModified = now;

    for (const configFile of configFiles) {
      try {
        const parsed = await parseConfigFile(configFile);
        if (parsed.error || parsed.entries.length === 0) {
          continue;
        }

        const fileId = hashContent(configFile.relativePath);
        let fileRecord = manifest.files.find(f => f.id === fileId);

        if (!fileRecord) {
          fileRecord = {
            id: fileId,
            originalPath: configFile.relativePath,
            fileName: configFile.name,
            fileType: configFile.type,
            versions: []
          };
          manifest.files.push(fileRecord);
        }

        const currentContent = parsed.entries.reduce((acc, entry) => {
          acc[entry.key] = entry.rawValue !== undefined ? entry.rawValue : entry.value;
          return acc;
        }, {} as any);

        const currentHash = hashContent(currentContent);

        const lastVersion = fileRecord.versions[fileRecord.versions.length - 1];
        if (!lastVersion || lastVersion.hash !== currentHash) {
          changesDetected++;
          
          const newVersion: BackupVersion = {
            versionNumber: fileRecord.versions.length + 1,
            timestamp: now,
            hash: currentHash
          };

          if (fileRecord.versions.length === 0) {
            newVersion.content = currentContent;
          } else {
            const lastContent = await reconstructAtVersion(fileRecord, fileRecord.versions.length);
            const patches = generateJsonPatch(lastContent, currentContent);
            newVersion.changes = patches;
          }

          fileRecord.versions.push(newVersion);
        }
      } catch (error) {
        console.warn(`Warning: Could not process ${configFile.path}: ${error}`);
      }
    }

    if (dryRun) {
      return {
        success: true,
        backupPath,
        filesProcessed: configFiles.length,
        changesDetected,
        encrypted: false
      };
    }

    await saveBackup(manifest, backupPath);
    await ensureGitIgnore(backupPath, false);

    return {
      success: true,
      backupPath,
      filesProcessed: configFiles.length,
      changesDetected,
      encrypted: false
    };

  } catch (error) {
    return {
      success: false,
      backupPath,
      filesProcessed: 0,
      changesDetected: 0,
      encrypted: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function restoreFromBackup(
  backupPath: string,
  filePath: string,
  version: number,
  outputPath?: string
): Promise<{ success: boolean; error?: string; restoredPath?: string }> {
  try {
    const manifest = await loadBackup(backupPath);
    if (!manifest) {
      return { success: false, error: 'Backup file not found' };
    }

    const fileRecord = manifest.files.find(f => 
      f.originalPath === filePath || 
      f.fileName === filePath ||
      f.originalPath.endsWith(filePath)
    );

    if (!fileRecord) {
      return { success: false, error: `File ${filePath} not found in backup` };
    }

    const content = await reconstructAtVersion(fileRecord, version);
    const restoredPath = outputPath || fileRecord.originalPath;

    let contentStr: string;
    if (fileRecord.fileType === 'json') {
      contentStr = JSON.stringify(content, null, 2);
    } else if (fileRecord.fileType === 'env') {
      contentStr = Object.entries(content)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
    } else {
      contentStr = JSON.stringify(content, null, 2);
    }

    const fullRestoredPath = resolve(restoredPath);
    await writeFile(fullRestoredPath, contentStr, 'utf-8');

    return { success: true, restoredPath: fullRestoredPath };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}