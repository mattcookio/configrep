import { readdir, stat } from 'fs/promises';
import { join, extname, relative } from 'path';
import type { ConfigFile } from '../types.ts';
import { shouldIgnore } from './ignore';

export function detectFileType(fileName: string): ConfigFile['type'] {
  if (fileName.startsWith('.env') || fileName.endsWith('.env')) return 'env';
  const ext = extname(fileName).toLowerCase();
  switch (ext) {
    case '.json': return 'json';
    case '.yaml':
    case '.yml': return 'yaml';
    case '.toml': return 'toml';
    case '.ini': return 'ini';
    default: return 'unknown';
  }
}

export async function findConfigFiles(
  directory: string,
  rootDirectory: string,
  configPatterns: string[],
  maxDepth: number = 5,
  ignorePatterns: string[] = []
): Promise<ConfigFile[]> {
  const files: ConfigFile[] = [];
  await scanDirectory(directory, rootDirectory, configPatterns, files, 0, maxDepth, ignorePatterns);
  return files.sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

async function scanDirectory(
  directory: string,
  rootDirectory: string,
  configPatterns: string[],
  files: ConfigFile[],
  currentDepth: number,
  maxDepth: number,
  ignorePatterns: string[]
): Promise<void> {
  if (currentDepth > maxDepth) return;
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (shouldIgnore(entry.name, fullPath, ignorePatterns, rootDirectory)) continue;
        await scanDirectory(fullPath, rootDirectory, configPatterns, files, currentDepth + 1, maxDepth, ignorePatterns);
      } else if (entry.isFile()) {
        const fileName = entry.name;
        if (shouldIgnore(fileName, fullPath, ignorePatterns, rootDirectory)) continue;
        const configExtensions = ['.json', '.yaml', '.yml', '.toml', '.ini'];
        const isConfigFile = configPatterns.some(pattern => fileName === pattern) ||
          fileName.startsWith('.env') ||
          fileName.includes('config') ||
          fileName.includes('settings') ||
          fileName.endsWith('.config.json') ||
          configExtensions.includes(extname(fileName).toLowerCase());
        if (isConfigFile) {
          const stats = await stat(fullPath);
          const fileType = detectFileType(fileName);
          const relativePath = relative(rootDirectory, fullPath);
          files.push({
            path: fullPath,
            name: fileName,
            relativePath,
            type: fileType,
            size: stats.size,
            depth: currentDepth
          });
        }
      }
    }
  } catch (error) {
    // Optionally log error
  }
}
