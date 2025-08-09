#!/usr/bin/env bun

import { program } from 'commander';
import inquirer from 'inquirer';
import { readdir, stat, readFile, writeFile } from 'fs/promises';
import { join, extname, basename, relative, resolve } from 'path';
import { existsSync } from 'fs';
import React from 'react';
import { render } from 'ink';
import MillerTreeComponent from './miller-tree-component.js';
import InteractiveSearchComponent from './interactive-search-component.js';

interface ConfigFile {
  path: string;
  name: string;
  relativePath: string;
  type: 'env' | 'json' | 'yaml' | 'toml' | 'ini' | 'unknown';
  size: number;
  depth: number;
}

interface ConfigEntry {
  key: string;
  value: string;
  file: string;
}

interface ParsedConfig {
  file: ConfigFile;
  entries: ConfigEntry[];
  error?: string;
}

interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isConfigEntry?: boolean;
  children: TreeNode[];
  configFile?: ConfigFile;
  configEntry?: ConfigEntry;
}

interface ConfiGREPConfig {
  directory?: string;
  ignore?: string[];
  depth?: number;
  defaultCommand?: 'list' | 'show' | 'interactive';
  fileTypes?: {
    env?: boolean;
    json?: boolean;
    yaml?: boolean;
    toml?: boolean;
    ini?: boolean;
  };
}

// Config file loading utilities
async function loadConfigFile(searchDir: string = process.cwd()): Promise<ConfiGREPConfig> {
  const configPath = join(searchDir, 'configrep.json');
  
  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const configContent = await readFile(configPath, 'utf-8');
    const config = JSON.parse(configContent) as ConfiGREPConfig;
    
    // Resolve relative path to absolute path
    if (config.directory) {
      config.directory = resolve(searchDir, config.directory);
    }
    
    return config;
  } catch (error) {
    console.warn(`Warning: Could not parse configrep.json: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {};
  }
}

function mergeConfigWithOptions(config: ConfiGREPConfig, options: any, ignoreExplicitlyProvided: boolean = false): any {
  const result = {
    dir: options.dir || config.directory || process.cwd(),
    ignore: ignoreExplicitlyProvided ? options.ignore : (config.ignore || []),
    depth: options.depth !== undefined ? options.depth : (config.depth || 5),
    ...options // CLI options take precedence
  };
  
  // Override ignore if it wasn't explicitly provided
  if (!ignoreExplicitlyProvided) {
    result.ignore = config.ignore || [];
  }
  
  return result;
}

async function createExampleConfig(targetDir: string): Promise<void> {
  const configPath = join(targetDir, 'configrep.json');
  
  if (existsSync(configPath)) {
    throw new Error('configrep.json already exists in this directory');
  }

  const exampleConfig: ConfiGREPConfig = {
    directory: ".",
    ignore: [
      "node_modules",
      "dist",
      "build",
      "coverage",
      ".git",
      "*.tmp",
      "*.log"
    ],
    depth: 5,
    defaultCommand: "interactive",
    fileTypes: {
      env: true,
      json: true,
      yaml: true,
      toml: true,
      ini: true
    }
  };

  await writeFile(configPath, JSON.stringify(exampleConfig, null, 2));
}

class ConfigExplorer {
  private configFiles: ConfigFile[] = [];
  private parsedConfigs: ParsedConfig[] = [];
  private rootDirectory: string = process.cwd();

  setRootDirectory(directory: string): void {
    this.rootDirectory = directory;
  }

  private shouldIgnore(name: string, fullPath: string, ignorePatterns: string[]): boolean {
    for (const pattern of ignorePatterns) {
      if (this.matchesGlobPattern(pattern, name, fullPath)) {
        return true;
      }
    }
    return false;
  }

  private matchesGlobPattern(pattern: string, name: string, fullPath: string): boolean {
    const relativePath = relative(this.rootDirectory, fullPath);
    
    // Handle different pattern types
    if (pattern.startsWith('/')) {
      // Absolute pattern from root - match against relative path
      const cleanPattern = pattern.slice(1);
      return this.globToRegex(cleanPattern).test(relativePath);
    } else if (pattern.includes('/')) {
      // Pattern with path separators - match against relative path and path segments
      const regex = this.globToRegex(pattern);
      return regex.test(relativePath) || this.matchesPathSegments(pattern, relativePath);
    } else {
      // Simple filename pattern - match against basename and any path segment
      const regex = this.globToRegex(pattern);
      return regex.test(name) || this.matchesAnyPathSegment(pattern, relativePath);
    }
  }

  private globToRegex(pattern: string): RegExp {
    if (!pattern) return new RegExp('^$');
    
    // Handle brace expansion {js,ts} first
    let expandedPattern = pattern;
    const braceMatch = pattern.match(/\{([^}]+)\}/);
    if (braceMatch && braceMatch[1]) {
      const options = braceMatch[1].split(',');
      expandedPattern = `(${options.join('|')})`;
      expandedPattern = pattern.replace(/\{[^}]+\}/, expandedPattern);
    }
    
    // First, replace glob wildcards with placeholders to protect them
    let regexPattern = expandedPattern
      .replace(/\*\*/g, '§DOUBLESTAR§')      // ** matches any path (including /)
      .replace(/\*/g, '§STAR§')              // * matches any chars except /
      .replace(/\?/g, '§QUESTION§');         // ? matches single char
    
    // Now escape special regex characters
    regexPattern = regexPattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
    
    // Handle bracket expressions [abc] and [!abc]
    regexPattern = regexPattern.replace(/\\\[([^\]]*)\\\]/g, (_, chars: string) => {
      if (chars.startsWith('!')) {
        return `[^${chars.slice(1)}]`;
      }
      return `[${chars}]`;
    });
    
    // Replace placeholders with actual regex patterns
    regexPattern = regexPattern
      .replace(/§DOUBLESTAR§/g, '.*')        // ** matches any path (including /)
      .replace(/§STAR§/g, '[^/]*')           // * matches any chars except /
      .replace(/§QUESTION§/g, '.');          // ? matches single char
    
    return new RegExp(`^${regexPattern}$`);
  }

  private matchesPathSegments(pattern: string, relativePath: string): boolean {
    const pathParts = relativePath.split('/');
    const patternParts = pattern.split('/');
    
    // Try to match pattern against any contiguous sequence of path parts
    for (let i = 0; i <= pathParts.length - patternParts.length; i++) {
      let matches = true;
      for (let j = 0; j < patternParts.length; j++) {
        const pathPart = pathParts[i + j];
        const patternPart = patternParts[j];
        if (!pathPart || !patternPart || !this.globToRegex(patternPart).test(pathPart)) {
          matches = false;
          break;
        }
      }
      if (matches) return true;
    }
    return false;
  }

  private matchesAnyPathSegment(pattern: string, relativePath: string): boolean {
    const pathParts = relativePath.split('/');
    const regex = this.globToRegex(pattern);
    return pathParts.some(part => regex.test(part));
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

    const files: ConfigFile[] = [];
    await this.scanDirectory(directory, configPatterns, files, 0, maxDepth, ignorePatterns);
    return files.sort((a, b) => {
      // Sort by depth first, then by path
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.relativePath.localeCompare(b.relativePath);
    });
  }

  private async scanDirectory(
    directory: string, 
    configPatterns: string[], 
    files: ConfigFile[], 
    currentDepth: number, 
    maxDepth: number,
    ignorePatterns: string[] = []
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Check if directory should be ignored
          if (this.shouldIgnore(entry.name, fullPath, ignorePatterns)) {
            continue;
          }
          
          // Recursively scan subdirectories
          await this.scanDirectory(fullPath, configPatterns, files, currentDepth + 1, maxDepth, ignorePatterns);
        } else if (entry.isFile()) {
          const fileName = entry.name;
          
          // Check if file should be ignored
          if (this.shouldIgnore(fileName, fullPath, ignorePatterns)) {
            continue;
          }
          
          // Check if it matches our config patterns or has config-like extensions
          const isConfigFile = configPatterns.some(pattern => 
            fileName === pattern || 
            fileName.startsWith('.env') ||
            fileName.includes('config') ||
            fileName.includes('settings') ||
            fileName.endsWith('.config.json')
          );

          if (isConfigFile) {
            const stats = await stat(fullPath);
            const fileType = this.detectFileType(fileName);
            const relativePath = relative(this.rootDirectory, fullPath);
            
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
      console.error(`Error reading directory ${directory}:`, error);
    }
  }

  private detectFileType(fileName: string): ConfigFile['type'] {
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

  private async buildFileTree(configFiles: ConfigFile[]): Promise<TreeNode> {
    const root: TreeNode = {
      name: basename(this.rootDirectory) || 'root',
      path: this.rootDirectory,
      isFile: false,
      children: []
    };

    for (const configFile of configFiles) {
      const pathParts = configFile.relativePath.split('/').filter(part => part.length > 0);
      let currentNode = root;

      // Navigate/create the directory structure
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        if (!dirName) continue;
        
        let childNode = currentNode.children.find(child => child.name === dirName && !child.isFile);
        
        if (!childNode) {
          childNode = {
            name: dirName,
            path: join(currentNode.path, dirName),
            isFile: false,
            children: []
          };
          currentNode.children.push(childNode);
        }
        currentNode = childNode;
      }

      // Add the file with its config entries as children
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        const fileNode: TreeNode = {
          name: fileName,
          path: configFile.path,
          isFile: true,
          children: [],
          configFile
        };

        // Parse the config file and add entries as children
        try {
          const parsed = await this.parseConfigFile(configFile);
          if (!parsed.error && parsed.entries.length > 0) {
            for (const entry of parsed.entries) {
              fileNode.children.push({
                name: `${entry.key} = ${entry.value.length > 50 ? entry.value.substring(0, 50) + '...' : entry.value}`,
                path: `${configFile.path}#${entry.key}`,
                isFile: false,
                isConfigEntry: true,
                children: [],
                configEntry: entry
              });
            }
          }
        } catch (error) {
          // If parsing fails, just add the file without entries
          console.error(`Error parsing ${configFile.path}:`, error);
        }

        currentNode.children.push(fileNode);
      }
    }

    // Sort children: directories first, then files, both alphabetically
    this.sortTreeNode(root);
    return root;
  }

  private sortTreeNode(node: TreeNode): void {
    node.children.sort((a, b) => {
      if (a.isFile !== b.isFile) {
        return a.isFile ? 1 : -1; // Directories first
      }
      return a.name.localeCompare(b.name);
    });

    node.children.forEach(child => {
      this.sortTreeNode(child);
    });
  }





  async parseConfigFile(configFile: ConfigFile): Promise<ParsedConfig> {
    try {
      const content = await readFile(configFile.path, 'utf-8');
      const entries: ConfigEntry[] = [];

      switch (configFile.type) {
        case 'env':
          entries.push(...this.parseEnvFile(content, configFile.path));
          break;
        case 'json':
          entries.push(...this.parseJsonFile(content, configFile.path));
          break;
        case 'yaml':
          entries.push(...this.parseYamlFile(content, configFile.path));
          break;
        case 'toml':
          entries.push(...this.parseTomlFile(content, configFile.path));
          break;
        case 'ini':
          entries.push(...this.parseIniFile(content, configFile.path));
          break;
        default:
          // Don't try to parse unknown file types
          break;
      }

      return { file: configFile, entries };
    } catch (error) {
      return { 
        file: configFile, 
        entries: [], 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private parseEnvFile(content: string, filePath: string): ConfigEntry[] {
    const entries: ConfigEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remove quotes
          entries.push({ key: key.trim(), value: value.trim(), file: filePath });
        }
      }
    }

    return entries;
  }

  private parseJsonFile(content: string, filePath: string): ConfigEntry[] {
    const entries: ConfigEntry[] = [];
    
    try {
      const json = JSON.parse(content);
      this.flattenObject(json, '', entries, filePath);
    } catch (error) {
      // Invalid JSON, return empty
    }

    return entries;
  }

  private parseYamlFile(content: string, filePath: string): ConfigEntry[] {
    // Simple YAML parsing - for production use a proper YAML parser
    const entries: ConfigEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        if (key) {
          const value = valueParts.join(':').trim().replace(/^["']|["']$/g, '');
          if (value) {
            entries.push({ key: key.trim(), value, file: filePath });
          }
        }
      }
    }

    return entries;
  }

  private parseTomlFile(content: string, filePath: string): ConfigEntry[] {
    // Simple TOML parsing - for production use a proper TOML parser
    const entries: ConfigEntry[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          entries.push({ key: key.trim(), value, file: filePath });
        }
      }
    }

    return entries;
  }

  private parseIniFile(content: string, filePath: string): ConfigEntry[] {
    const entries: ConfigEntry[] = [];
    const lines = content.split('\n');
    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        currentSection = trimmed.slice(1, -1);
      } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith(';') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          const value = valueParts.join('=').trim();
          const fullKey = currentSection ? `${currentSection}.${key.trim()}` : key.trim();
          entries.push({ key: fullKey, value, file: filePath });
        }
      }
    }

    return entries;
  }



  private flattenObject(obj: any, prefix: string, entries: ConfigEntry[], filePath: string): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.flattenObject(value, fullKey, entries, filePath);
      } else {
        entries.push({ 
          key: fullKey, 
          value: Array.isArray(value) ? JSON.stringify(value) : String(value), 
          file: filePath 
        });
      }
    }
  }

  async runInteractive(ignorePatterns: string[] = []): Promise<void> {
    console.log('🔍 ConfiGREP - Interactive Config File Explorer\n');

    // Find config files
    console.log('Scanning for config files recursively...');
    this.configFiles = await this.findConfigFiles(this.rootDirectory, 5, ignorePatterns);

    if (this.configFiles.length === 0) {
      console.log('No config files found in the current directory tree.');
      return;
    }

    console.log(`Found ${this.configFiles.length} config file(s)\n`);

    while (true) {
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'What would you like to do?',
          choices: [
            'Browse',
            'Search',
            'Exit'
          ]
        }
      ]);

      switch (action) {
        case 'Browse':
          await this.browseInteractiveTree();
          console.log('\n');
          break;
        case 'Search':
          await this.interactiveSearch();
          console.log('\n');
          break;
        case 'Exit':
          console.log('Goodbye! 👋');
          return;
      }
    }
  }

  private async browseInteractiveTree(): Promise<void> {
    const tree = await this.buildFileTree(this.configFiles);
    
    return new Promise<void>((resolve) => {
      const handleExit = () => {
        app.unmount();
        resolve();
      };

      // Use a unique key to force fresh component instance each time
      const app = render(
        React.createElement(MillerTreeComponent, {
          key: Date.now(), // Force fresh instance
          tree,
          onExit: handleExit
        })
      );
    });
  }











  private async interactiveSearch(): Promise<void> {
    // Parse all config files if not already done
    if (this.parsedConfigs.length === 0) {
      console.log('\nParsing all config files...');
      for (const file of this.configFiles) {
        const parsed = await this.parseConfigFile(file);
        this.parsedConfigs.push(parsed);
      }
    }

    const allEntries = this.parsedConfigs.flatMap(config => config.entries);
    
    if (allEntries.length === 0) {
      console.log('No configuration entries found.');
      return;
    }
    
    return new Promise<void>((resolve) => {
      const handleExit = () => {
        app.unmount();
        resolve();
      };

      // Use a unique key to force fresh component instance each time
      const app = render(
        React.createElement(InteractiveSearchComponent, {
          key: Date.now(), // Force fresh instance
          allEntries,
          onExit: handleExit,
          buildFilteredTree: (entries: ConfigEntry[]) => this.buildFilteredTree(entries)
        })
      );
    });
  }

  private async buildFilteredTree(allEntries: ConfigEntry[]): Promise<TreeNode> {
    const root: TreeNode = {
      name: 'Search Results',
      path: this.rootDirectory,
      isFile: false,
      children: []
    };

    // Group entries by file
    const entriesByFile = new Map<string, ConfigEntry[]>();
    for (const entry of allEntries) {
      if (!entriesByFile.has(entry.file)) {
        entriesByFile.set(entry.file, []);
      }
      entriesByFile.get(entry.file)!.push(entry);
    }

    // Create file nodes with their entries
    for (const [filePath, entries] of entriesByFile) {
      const fileName = basename(filePath);
      const relativePath = relative(this.rootDirectory, filePath);
      
      const configFile: ConfigFile = {
        path: filePath,
        name: fileName,
        relativePath,
        type: this.detectFileType(fileName),
        size: 0,
        depth: 0
      };

      const fileNode: TreeNode = {
        name: fileName,
        path: filePath,
        isFile: true,
        children: [],
        configFile
      };

      // Add entries as children
      for (const entry of entries) {
        fileNode.children.push({
          name: `${entry.key} = ${entry.value.length > 50 ? entry.value.substring(0, 50) + '...' : entry.value}`,
          path: `${filePath}#${entry.key}`,
          isFile: false,
          isConfigEntry: true,
          children: [],
          configEntry: entry
        });
      }

      root.children.push(fileNode);
    }

    // Sort children
    this.sortTreeNode(root);
    return root;
  }

  async listFiles(maxDepth: number = 5, options?: { glob?: string[]; dir?: string; ignore?: string[] }): Promise<void> {
    let filesToShow: ConfigFile[] = [];
    const directory = options?.dir || process.cwd();
    
    if (options?.glob && options.glob.length > 0) {
      // Search with glob patterns
      for (const globPattern of options.glob) {
        // Temporarily set root directory for this search
        const originalRoot = this.rootDirectory;
        this.rootDirectory = directory;
        const files = await this.findFilesByGlob(globPattern, maxDepth);
        this.rootDirectory = originalRoot;
        filesToShow.push(...files);
      }
    } else {
      // Search for config files
      const files = await this.findConfigFiles(directory, maxDepth, options?.ignore || []);
      filesToShow.push(...files);
    }
    
    if (filesToShow.length === 0) {
      return;
    }

    // Remove duplicates based on path
    const uniqueFiles = filesToShow.filter((file, index, self) => 
      index === self.findIndex(f => f.path === file.path)
    );

    // Build a simple file tree structure for display (files only, no config entries)
    const tree = await this.buildSimpleFileTree(uniqueFiles);
    console.log('│');
    this.printTree(tree, '');
    console.log('');
  }

  async findFilesByGlob(globPattern: string, maxDepth: number = 5, ignorePatterns: string[] = []): Promise<ConfigFile[]> {
    const files: ConfigFile[] = [];
    await this.scanDirectoryForGlob(this.rootDirectory, globPattern, files, 0, maxDepth, ignorePatterns);
    return files.sort((a, b) => {
      // Sort by depth first, then by path
      if (a.depth !== b.depth) return a.depth - b.depth;
      return a.relativePath.localeCompare(b.relativePath);
    });
  }

  private async scanDirectoryForGlob(
    directory: string, 
    globPattern: string,
    files: ConfigFile[], 
    currentDepth: number, 
    maxDepth: number,
    ignorePatterns: string[] = []
  ): Promise<void> {
    if (currentDepth > maxDepth) return;

    try {
      const entries = await readdir(directory, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Check if directory should be ignored
          if (this.shouldIgnore(entry.name, fullPath, ignorePatterns)) {
            continue;
          }
          
          // Recursively scan subdirectories
          await this.scanDirectoryForGlob(fullPath, globPattern, files, currentDepth + 1, maxDepth, ignorePatterns);
        } else if (entry.isFile()) {
          const fileName = entry.name;
          
          // Check if file should be ignored
          if (this.shouldIgnore(fileName, fullPath, ignorePatterns)) {
            continue;
          }
          
          const relativePath = relative(this.rootDirectory, fullPath);
          
          // Check if file matches glob pattern using improved matching
          if (this.matchesGlobPattern(globPattern, fileName, fullPath)) {
            const stats = await stat(fullPath);
            const fileType = this.detectFileType(fileName);
            
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
      console.error(`Error reading directory ${directory}:`, error);
    }
  }

  private async buildSimpleFileTree(configFiles: ConfigFile[]): Promise<TreeNode> {
    const root: TreeNode = {
      name: basename(this.rootDirectory) || 'root',
      path: this.rootDirectory,
      isFile: false,
      children: []
    };

    for (const configFile of configFiles) {
      const pathParts = configFile.relativePath.split('/').filter(part => part.length > 0);
      let currentNode = root;

      // Navigate/create the directory structure
      for (let i = 0; i < pathParts.length - 1; i++) {
        const dirName = pathParts[i];
        if (!dirName) continue;
        
        let childNode = currentNode.children.find(child => child.name === dirName && !child.isFile);
        
        if (!childNode) {
          childNode = {
            name: dirName,
            path: join(currentNode.path, dirName),
            isFile: false,
            children: []
          };
          currentNode.children.push(childNode);
        }
        currentNode = childNode;
      }

      // Add the file (without config entries as children)
      const fileName = pathParts[pathParts.length - 1];
      if (fileName) {
        const fileNode: TreeNode = {
          name: fileName,
          path: configFile.path,
          isFile: true,
          children: [], // No config entries in list view
          configFile
        };

        currentNode.children.push(fileNode);
      }
    }

    // Sort children: directories first, then files, both alphabetically
    this.sortTreeNode(root);
    return root;
  }

  private printTree(node: TreeNode, prefix: string, isLast: boolean = true): void {
    if (node.name === basename(this.rootDirectory) || node.name === 'root' || node.name === 'Search Results') {
      // Don't print the root node, just its children
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        this.printTree(child, prefix, isLastChild);
      });
      return;
    }

    const connector = isLast ? '└── ' : '├── ';
    let icon: string;
    
    if (node.isConfigEntry) {
      icon = '🔑'; // Key icon for config values
    } else if (node.isFile) {
      icon = '📋'; // Clipboard icon for all files
    } else {
      icon = '📁'; // Folder icon for directories
    }
    
    console.log(`${prefix}${connector}${icon} ${node.name}`);

    if (node.children.length > 0) {
      const newPrefix = prefix + (isLast ? '    ' : '│   ');
      node.children.forEach((child, index) => {
        const isLastChild = index === node.children.length - 1;
        this.printTree(child, newPrefix, isLastChild);
      });
    }
  }

  async showEntries(options: { file?: string; glob?: string[]; all?: boolean; dir?: string; ignore?: string[] }): Promise<void> {
    let matchingFiles: ConfigFile[] = [];
    
    if (options.file || options.glob) {
      if (options.file) {
        // First scan for config files if not already done
        if (this.configFiles.length === 0) {
          this.configFiles = await this.findConfigFiles(this.rootDirectory, 5, options.ignore || []);
        }        // Find files matching the specific file pattern
        const matches = this.configFiles.filter(f => 
          f.path === options.file || 
          f.relativePath === options.file ||
          f.name === options.file ||
          f.path.endsWith(options.file!)
        );
        
        matchingFiles = options.all ? matches : matches.slice(0, 1);
      } else if (options.glob && options.glob.length > 0) {
        // Use glob pattern matching - scan all files, not just config files
        const directory = options.dir || process.cwd();
        let allMatchingFiles: ConfigFile[] = [];
        
        for (const globPattern of options.glob) {
          const originalRoot = this.rootDirectory;
          this.rootDirectory = directory;
          const files = await this.findFilesByGlob(globPattern, 5, options.ignore || []);
          this.rootDirectory = originalRoot;
          allMatchingFiles.push(...files);
        }
        
        // Remove duplicates
        allMatchingFiles = allMatchingFiles.filter((file, index, self) => 
          index === self.findIndex(f => f.path === file.path)
        );
        
        matchingFiles = options.all ? allMatchingFiles : allMatchingFiles.slice(0, 1);
      }
      
      if (matchingFiles.length === 0) {
        return;
      }
    } else {
      // Show all entries from directory
      const directory = options.dir || process.cwd();
      
      const originalRoot = this.rootDirectory;
      this.rootDirectory = directory;
      matchingFiles = await this.findConfigFiles(directory, 5, options.ignore || []);
      this.rootDirectory = originalRoot;
    }

    // Build tree with config entries and display
    const tree = await this.buildFileTree(matchingFiles);
    console.log('│');
    this.printTree(tree, '');
    console.log('');
  }

  async searchEntries(searchTerm: string, options: { keysOnly?: boolean; valuesOnly?: boolean; dir?: string; ignore?: string[] }): Promise<void> {
    const directory = options.dir || process.cwd();
    
    // Find config files in the directory
    const originalRoot = this.rootDirectory;
    this.rootDirectory = directory;
    this.configFiles = await this.findConfigFiles(directory, 5, options.ignore || []);
    this.rootDirectory = originalRoot;
    
    for (const file of this.configFiles) {
      const parsed = await this.parseConfigFile(file);
      this.parsedConfigs.push(parsed);
    }

    const allEntries = this.parsedConfigs.flatMap(config => config.entries);
    
    // Filter based on search options
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

    if (matches.length === 0) {
      return;
    }

    // Build a filtered tree with only matching entries
    const searchTree = await this.buildFilteredTree(matches);
    console.log('│');
    this.printTree(searchTree, '');
    console.log('');
  }


}

// CLI setup
program
  .name('configrep')
  .description('Config file explorer and analyzer')
  .version('1.0.0');

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
  .description('Show all config entries from all files')
  .option('-f, --file <path>', 'Show entries from specific file only')
  .option('-g, --glob <pattern...>', 'Show entries from files matching glob patterns (e.g., "*.env" "**/.json")')
  .option('-a, --all', 'Show all matching files instead of just the first one')
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
  console.log('  configrep init [dir]     Create example configrep.json config file');
  console.log('  configrep interactive    Launch interactive explorer');
  console.log('  configrep list           List all config files');
  console.log('  configrep show           Show all config entries');
  console.log('  configrep search <term>  Search config entries');
  console.log('\nUse --help with any command for more options.');
  console.log('Tip: Create a configrep.json file to set default options.');
});

program.parse();