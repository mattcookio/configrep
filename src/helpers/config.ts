import { join, resolve } from 'path';
import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import type { ConfiGREPConfig } from '../types.ts';

export async function loadConfigFile(searchDir: string = process.cwd()): Promise<ConfiGREPConfig> {
  const configPath = join(searchDir, 'configrep.json');
  if (!existsSync(configPath)) return {};
  try {
    const configContent = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent) as ConfiGREPConfig;
    if (config.directory) {
      config.directory = resolve(searchDir, config.directory);
    }
    return config;
  } catch (error) {
    // Optionally log warning
    return {};
  }
}

export function mergeConfigWithOptions(config: ConfiGREPConfig, options: any, ignoreExplicitlyProvided = false): any {
  // Default ignore patterns used when nothing else is specified
  const defaultIgnore = ['node_modules', 'dist', 'build', 'coverage', '.git', '*.tmp', '*.log'];
  
  let ignorePatterns: string[];
  if (ignoreExplicitlyProvided) {
    // User explicitly provided ignore patterns via CLI (even if empty)
    if (options.ignore && options.ignore.length > 0) {
      ignorePatterns = options.ignore;
    } else {
      // Empty ignore array means "don't ignore anything"
      ignorePatterns = [];
    }
  } else if (config.ignore !== undefined && config.ignore.length > 0) {
    // Config file exists and has ignore patterns
    ignorePatterns = config.ignore;
  } else {
    // No ignore patterns from CLI or config, use defaults
    ignorePatterns = defaultIgnore;
  }
  
  const result = {
    dir: options.dir || config.directory || process.cwd(),
    ignore: ignorePatterns,
    depth: options.depth !== undefined ? options.depth : (config.depth || 5),
    ...options
  };
  
  // Make sure ignore is set in result (options spread might override it)
  result.ignore = ignorePatterns;
  
  return result;
}

export async function createExampleConfig(targetDir: string): Promise<void> {
  const configPath = join(targetDir, 'configrep.json');
  if (existsSync(configPath)) throw new Error('configrep.json already exists in this directory');
  const exampleConfig: ConfiGREPConfig = {
    directory: '.',
    ignore: [
      'node_modules', 'dist', 'build', 'coverage', '.git', '*.tmp', '*.log'
    ],
    depth: 5,
    defaultCommand: 'interactive',
    fileTypes: { env: true, json: true, yaml: true, toml: true, ini: true }
  };
  await writeFile(configPath, JSON.stringify(exampleConfig, null, 2));
}
