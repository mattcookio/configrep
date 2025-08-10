#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import { resolve } from 'path';
import React from 'react';
import { render } from 'ink';

import MillerColumns from './components/MillerColumns';
import InteractiveSearch from './components/InteractiveSearch';

// Import types
import type { ConfigFile, ConfigEntry, ParsedConfig } from './types.ts';

// Import helpers
import { loadConfigFile, mergeConfigWithOptions, createExampleConfig } from './helpers/config';
import { findConfigFiles } from './helpers/discovery';
import { parseConfigFile } from './helpers/parse';
import { buildFileTree, buildSimpleFileTree, buildFilteredTree, printTree } from './helpers/tree';

class ConfigExplorer {
  private configFiles: ConfigFile[] = [];
  private parsedConfigs: ParsedConfig[] = [];
  private rootDirectory: string = process.cwd();

  setRootDirectory(directory: string): void {
    this.rootDirectory = directory;
  }

  async parseConfigFile(configFile: ConfigFile): Promise<ParsedConfig> {
    return await parseConfigFile(configFile);
  }

  async findConfigFiles(directory: string = this.rootDirectory, maxDepth: number = 5, ignorePatterns: string[] = []): Promise<ConfigFile[]> {
    this.rootDirectory = directory;
    const configPatterns = [
      '.env', '.env.local', '.env.development', '.env.production', '.env.test',
      'config.json', 'package.json', 'tsconfig.json', 'appsettings.json',
      'config.yaml', 'config.yml', '.eslintrc.json', '.prettierrc.json',
      'config.toml', 'pyproject.toml', 'Cargo.toml',
      'config.ini', '.gitconfig', 'docker-compose.yml', 'docker-compose.yaml',
      '.babelrc', '.babelrc.json', 'babel.config.json',
      'jest.config.json', 'vitest.config.json'
    ];
    return await findConfigFiles(directory, this.rootDirectory, configPatterns, maxDepth, ignorePatterns);
  }

  async runInteractive(ignorePatterns: string[] = []): Promise<void> {
    console.log('🔍 ConfiGREP - Interactive Config File Explorer\n');
    console.log('Scanning for config files recursively...');
    this.configFiles = await this.findConfigFiles(this.rootDirectory, 5, ignorePatterns);

    if (this.configFiles.length === 0) {
      console.log('No config files found in the current directory tree.');
      return;
    }

    console.log(`Found ${this.configFiles.length} config file(s)\n`);

    while (true) {
      try {
        const { action } = await inquirer.prompt([
          {
            type: 'list',
            name: 'action',
            message: 'What would you like to do?',
            choices: ['Browse', 'Search', 'Exit']
          }
        ]);

        // Clear all output from our tool including title
        // Lines to clear:
        // - Title + blank line (2 lines)
        // - "Scanning..." line (1 line)
        // - "Found X files" + blank line (2 lines)
        // - Menu question + 3 choices (3 lines, choices are on same line)
        // Total: 8 lines
        process.stdout.write('\x1b[8A');  // Move up 8 lines
        process.stdout.write('\x1b[0J');   // Clear from cursor to end of screen

        switch (action) {
          case 'Browse':
            await this.browseInteractiveTree();
            return;
          case 'Search':
            await this.interactiveSearch();
            return;
          case 'Exit':
            console.log('Goodbye! 👋');
            return;
        }
      } catch (error) {
        // Handle user force closing the prompt (Ctrl+C or Escape)
        if (error && typeof error === 'object' && 'name' in error) {
          const errorName = (error as any).name;
          if (errorName === 'ExitPromptError') {
            console.log('\nGoodbye! 👋');
            return;
          }
        }
        // Re-throw other errors
        throw error;
      }
    }
  }

  private async browseInteractiveTree(): Promise<void> {
    const tree = await buildFileTree(this.configFiles, this.rootDirectory);
    
    // Parse config files if not already parsed
    if (this.parsedConfigs.length === 0) {
      for (const file of this.configFiles) {
        const parsed = await parseConfigFile(file);
        this.parsedConfigs.push(parsed);
      }
    }
    
    // Create allConfigs map for find feature - only from the files we're browsing
    const allConfigs = new Map<string, ConfigEntry[]>();
    for (const file of this.configFiles) {
      const parsed = this.parsedConfigs.find(p => p.file.path === file.path);
      if (parsed && parsed.entries && parsed.entries.length > 0) {
        allConfigs.set(parsed.file.path, parsed.entries);
      }
    }
    
    render(
      React.createElement(MillerColumns, {
        key: Date.now(),
        tree,
        allConfigs
      })
    );
  }

  private async interactiveSearch(): Promise<void> {
    if (this.parsedConfigs.length === 0) {
      for (const file of this.configFiles) {
        const parsed = await parseConfigFile(file);
        this.parsedConfigs.push(parsed);
      }
    }

    const allEntries = this.parsedConfigs.flatMap(config => config.entries);
    if (allEntries.length === 0) {
      console.log('No configuration entries found.');
      return;
    }
    
    // Create allConfigs map for find feature
    const allConfigs = new Map<string, ConfigEntry[]>();
    for (const file of this.configFiles) {
      const parsed = this.parsedConfigs.find(p => p.file.path === file.path);
      if (parsed && parsed.entries && parsed.entries.length > 0) {
        allConfigs.set(parsed.file.path, parsed.entries);
      }
    }
    
    render(
      React.createElement(InteractiveSearch, {
        key: Date.now(),
        allEntries,
        buildFilteredTree: async (entries: ConfigEntry[], filter: string) => await buildFilteredTree(entries, this.rootDirectory, filter),
        allConfigs
      })
    );
  }

  async listFiles(maxDepth: number = 5, options?: { glob?: string[]; dir?: string; ignore?: string[] }): Promise<void> {
    let filesToShow: ConfigFile[] = [];
    const directory = options?.dir || process.cwd();
    
    if (options?.glob && options.glob.length > 0) {
      // For glob patterns, we'd need to implement findFilesByGlob in discovery helper
      // For now, fall back to config files
      const files = await findConfigFiles(directory, directory, [], maxDepth, options?.ignore || []);
      filesToShow.push(...files);
    } else {
      const files = await findConfigFiles(directory, directory, [], maxDepth, options?.ignore || []);
      filesToShow.push(...files);
    }
    
    if (filesToShow.length === 0) return;

    const uniqueFiles = filesToShow.filter((file, index, self) => 
      index === self.findIndex(f => f.path === file.path)
    );

    const tree = buildSimpleFileTree(uniqueFiles, directory);
    console.log('│');
    printTree(tree, '');
    console.log('');
  }

  async showEntries(options: { file?: string; glob?: string[]; all?: boolean; dir?: string; ignore?: string[]; tree?: boolean }): Promise<void> {
    let matchingFiles: ConfigFile[] = [];
    
    if (options.file || options.glob) {
      if (options.file) {
        if (this.configFiles.length === 0) {
          this.configFiles = await findConfigFiles(this.rootDirectory, this.rootDirectory, [], 5, options.ignore || []);
        }
        const matches = this.configFiles.filter(f => 
          f.path === options.file || 
          f.relativePath === options.file ||
          f.name === options.file ||
          f.path.endsWith(options.file!)
        );
        matchingFiles = options.all ? matches : matches.slice(0, 1);
      } else if (options.glob && options.glob.length > 0) {
        const directory = options.dir || process.cwd();
        // For glob patterns, we'd need to implement findFilesByGlob in discovery helper
        // For now, fall back to config files
        const allMatchingFiles = await findConfigFiles(directory, directory, [], 5, options.ignore || []);
        matchingFiles = options.all ? allMatchingFiles : allMatchingFiles.slice(0, 1);
      }
      
      if (matchingFiles.length === 0) return;
    } else {
      const directory = options.dir || process.cwd();
      matchingFiles = await findConfigFiles(directory, directory, [], 5, options.ignore || []);
    }

    const tree = await buildFileTree(matchingFiles, this.rootDirectory, options.tree || false); // Use tree flag
    console.log('│');
    printTree(tree, '');
    console.log('');
  }

  async searchEntries(searchTerm: string, options: { keysOnly?: boolean; valuesOnly?: boolean; dir?: string; ignore?: string[]; tree?: boolean }): Promise<void> {
    const directory = options.dir || process.cwd();
    this.configFiles = await findConfigFiles(directory, directory, [], 5, options.ignore || []);
    
    for (const file of this.configFiles) {
      const parsed = await parseConfigFile(file);
      this.parsedConfigs.push(parsed);
    }

    const allEntries = this.parsedConfigs.flatMap(config => config.entries);
    const matches = allEntries.filter(entry => {
      const term = searchTerm.toLowerCase();
      if (options.keysOnly) {
        return entry.key.toLowerCase().includes(term);
      } else if (options.valuesOnly) {
        return entry.value.toLowerCase().includes(term);
      } else {
        return entry.key.toLowerCase().includes(term) || 
               entry.value.toLowerCase().includes(term);
      }
    });

    if (matches.length === 0) return;

    const searchTree = await buildFilteredTree(matches, this.rootDirectory, undefined, options.tree || false); // Use tree flag
    console.log('│');
    printTree(searchTree, '');
    console.log('');
  }
}

// CLI setup
program
  .name('cfg')
  .description('Config file explorer and analyzer')
  .version('1.3.0');

// Initialize config file
program
  .command('init [directory]')
  .description('Create an example configrep.json config file')
  .action(async (directory) => {
    const targetDir = directory ? resolve(directory) : process.cwd();
    try {
      await createExampleConfig(targetDir);
      console.log(`✅ Created configrep.json in ${targetDir}`);
    } catch (error) {
      console.error(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });

// Interactive mode
program
  .command('interactive')
  .alias('i')
  .description('Launch interactive config file explorer')
  .option('--dir <path>', 'Directory to search from', process.cwd())
  .option('--ignore <pattern...>', 'Glob patterns to ignore (e.g., "node_modules" "*.tmp")', [])
  .action(async (options) => {
    const config = await loadConfigFile();
    const ignoreExplicitlyProvided = options.ignore && options.ignore.length > 0;
    const mergedOptions = mergeConfigWithOptions(config, options, ignoreExplicitlyProvided);
    
    const explorer = new ConfigExplorer();
    explorer.setRootDirectory(mergedOptions.dir);
    await explorer.runInteractive(mergedOptions.ignore);
  });

// List all config files
program
  .command('list')
  .alias('ls')
  .description('List all config files found')
  .option('-d, --depth <number>', 'Maximum directory depth to scan', '5')
  .option('-g, --glob <pattern...>', 'List files matching glob patterns (e.g., "*.env" "**/.json")')
  .option('--dir <path>', 'Directory to search from', process.cwd())
  .option('--ignore <pattern...>', 'Glob patterns to ignore (e.g., "node_modules" "*.tmp")', [])
  .action(async (options) => {
    const config = await loadConfigFile();
    const ignoreExplicitlyProvided = options.ignore && options.ignore.length > 0;
    const mergedOptions = mergeConfigWithOptions(config, options, ignoreExplicitlyProvided);
    
    const explorer = new ConfigExplorer();
    await explorer.listFiles(parseInt(mergedOptions.depth), mergedOptions);
  });

// Show all config entries
program
  .command('show')
  .alias('s')
  .description('Show all config entries from all files')
  .option('-f, --file <path>', 'Show entries from specific file only')
  .option('-g, --glob <pattern...>', 'Show entries from files matching glob patterns (e.g., "*.env" "**/.json")')
  .option('-a, --all', 'Show all matching files instead of just the first one')
  .option('--tree', 'Display entries in nested tree format instead of flat dot notation')
  .option('--dir <path>', 'Directory to search from', process.cwd())
  .option('--ignore <pattern...>', 'Glob patterns to ignore (e.g., "node_modules" "*.tmp")', [])
  .action(async (options) => {
    const config = await loadConfigFile();
    const ignoreExplicitlyProvided = options.ignore && options.ignore.length > 0;
    const mergedOptions = mergeConfigWithOptions(config, options, ignoreExplicitlyProvided);
    
    const explorer = new ConfigExplorer();
    await explorer.showEntries(mergedOptions);
  });

// Search for config entries
program
  .command('search <term>')
  .description('Search for config entries by key or value')
  .option('-k, --keys-only', 'Search keys only')
  .option('-v, --values-only', 'Search values only')
  .option('--tree', 'Display entries in nested tree format instead of flat dot notation')
  .option('--dir <path>', 'Directory to search from', process.cwd())
  .option('--ignore <pattern...>', 'Glob patterns to ignore (e.g., "node_modules" "*.tmp")', [])
  .action(async (term, options) => {
    const config = await loadConfigFile();
    const ignoreExplicitlyProvided = options.ignore && options.ignore.length > 0;
    const mergedOptions = mergeConfigWithOptions(config, options, ignoreExplicitlyProvided);
    
    const explorer = new ConfigExplorer();
    await explorer.searchEntries(term, mergedOptions);
  });

// Default action when no command is specified
program.action(async () => {
  console.log('🔍 ConfiGREP - Config File Explorer\n');
  console.log('Usage:');
  console.log('  cfg init [dir]       Create example configrep.json config file');
  console.log('  cfg interactive (i)  Launch interactive explorer');
  console.log('  cfg list (ls)        List all config files');
  console.log('  cfg show (s)         Show all config entries');
  console.log('  cfg search <term>    Search config entries');
  console.log('\nUse --help with any command for more options.');
  console.log('Tip: Create a configrep.json file to set default options.');
});

program.parse();

// Export for testing
export { ConfigExplorer };