import { basename, join } from 'path';
import type { ConfigFile, ConfigEntry, TreeNode } from '../types.ts';
import { parseConfigFile } from './parse';

// Helper function to build nested tree from dot notation keys
function buildNestedTree(entries: ConfigEntry[], filePath: string): TreeNode[] {
  // Build a hierarchical structure from flat entries
  const tree: { [key: string]: any } = {};
  const entryMap = new Map<string, ConfigEntry>();
  
  // Store all entries in a map for quick lookup
  for (const entry of entries) {
    entryMap.set(entry.key, entry);
  }
  
  // Build the tree structure
  for (const entry of entries) {
    const parts = entry.key.split(/[\.\[\]]+/).filter(Boolean);
    let current = tree;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      if (!current[part]) {
        current[part] = {};
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = entry;
    }
  }
  
  // Convert tree structure to TreeNode array
  function convertToTreeNodes(obj: any, prefix: string = ''): TreeNode[] {
    const nodes: TreeNode[] = [];
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (value && typeof value === 'object' && 'key' in value && 'value' in value) {
        // This is a leaf node (ConfigEntry)
        const entry = value as ConfigEntry;
        nodes.push({
          name: `${key} = ${entry.value.length > 50 ? entry.value.substring(0, 50) + '...' : entry.value}`,
          path: `${filePath}#${entry.key}`,
          isFile: false,
          isConfigEntry: true,
          children: [],
          configEntry: entry
        });
      } else if (value && typeof value === 'object') {
        // This is a parent node with children
        const childNodes = convertToTreeNodes(value, fullKey);
        nodes.push({
          name: key,
          path: `${filePath}#${fullKey}`,
          isFile: false,
          isConfigEntry: false,
          children: childNodes
        });
      }
    }
    
    return nodes;
  }
  
  return convertToTreeNodes(tree);
}

export async function buildFileTree(configFiles: ConfigFile[], rootDirectory: string, useNestedDisplay: boolean = false): Promise<TreeNode> {
  const root: TreeNode = {
    name: basename(rootDirectory) || 'root',
    path: rootDirectory,
    isFile: false,
    children: [] as TreeNode[]
  };
  for (const configFile of configFiles) {
    const pathParts = configFile.relativePath.split('/').filter(Boolean);
    let currentNode = root;
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
    const fileName = pathParts[pathParts.length - 1];
    if (fileName) {
      const fileNode: TreeNode = {
        name: fileName,
        path: configFile.path,
        isFile: true,
        children: [],
        configFile
      };
      try {
        const parsed = await parseConfigFile(configFile);
        if (!parsed.error && parsed.entries.length > 0) {
          if (useNestedDisplay && (configFile.type === 'json' || configFile.type === 'yaml' || configFile.type === 'toml')) {
            // Build nested tree structure for JSON/YAML/TOML
            fileNode.children = buildNestedTree(parsed.entries, configFile.path);
          } else {
            // Show all entries including flattened nested values (for interactive mode or env/ini files)
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
        }
      } catch (error) {
        // If parsing fails, just add the file without entries
      }
      currentNode.children.push(fileNode);
    }
  }
  sortTreeNode(root);
  return root;
}

export function buildSimpleFileTree(configFiles: ConfigFile[], rootDirectory: string): TreeNode {
  const root: TreeNode = {
    name: basename(rootDirectory) || 'root',
    path: rootDirectory,
    isFile: false,
    children: []
  };
  for (const configFile of configFiles) {
    const pathParts = configFile.relativePath.split('/').filter(Boolean);
    let currentNode = root;
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
    const fileName = pathParts[pathParts.length - 1];
    if (fileName) {
      const fileNode: TreeNode = {
        name: fileName,
        path: configFile.path,
        isFile: true,
        children: [],
        configFile
      };
      currentNode.children.push(fileNode);
    }
  }
  sortTreeNode(root);
  return root;
}

export async function buildFilteredTree(allEntries: ConfigEntry[], rootDirectory: string, _filter?: string, useNestedDisplay: boolean = false): Promise<TreeNode> {
  const root: TreeNode = {
    name: 'Search Results',
    path: rootDirectory,
    isFile: false,
    children: []
  };
  const entriesByFile = new Map<string, ConfigEntry[]>();
  for (const entry of allEntries) {
    if (!entriesByFile.has(entry.file)) {
      entriesByFile.set(entry.file, []);
    }
    entriesByFile.get(entry.file)!.push(entry);
  }
  for (const [filePath, entries] of entriesByFile) {
    const fileName = basename(filePath);
    
    // Determine file type from name
    const fileType = fileName.endsWith('.json') ? 'json' :
                     fileName.endsWith('.yaml') || fileName.endsWith('.yml') ? 'yaml' :
                     fileName.endsWith('.toml') ? 'toml' :
                     fileName.startsWith('.env') ? 'env' :
                     fileName.endsWith('.ini') ? 'ini' : 'unknown';
    
    const fileNode: TreeNode = {
      name: fileName,
      path: filePath,
      isFile: true,
      children: [],
      configFile: undefined
    };
    
    if (useNestedDisplay && (fileType === 'json' || fileType === 'yaml' || fileType === 'toml')) {
      // Build nested tree structure for JSON/YAML/TOML
      fileNode.children = buildNestedTree(entries, filePath);
    } else {
      // Flat display with dot notation
      fileNode.children = entries.map(entry => ({
        name: `${entry.key} = ${entry.value.length > 50 ? entry.value.substring(0, 50) + '...' : entry.value}`,
        path: `${filePath}#${entry.key}`,
        isFile: false,
        isConfigEntry: true,
        children: [],
        configEntry: entry
      }));
    }
    
    root.children.push(fileNode);
  }
  sortTreeNode(root);
  return root;
}

export function sortTreeNode(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isFile !== b.isFile) {
      return a.isFile ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
  node.children.forEach(child => sortTreeNode(child));
}

export function printTree(node: TreeNode, prefix = '', isLast = true): void {
  if (node.name === 'root' || node.name === 'Search Results') {
    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      printTree(child, prefix, isLastChild);
    });
    return;
  }
  const connector = isLast ? '└── ' : '├── ';
  let icon: string;
  if (node.isConfigEntry) {
    // Check if the value is an object or array based on the display text
    const valueMatch = node.name.match(/= (.+)$/);
    if (valueMatch && valueMatch[1]) {
      const value = valueMatch[1];
      if (value.startsWith('{ ')) {
        icon = '{}';  // Object (even if truncated)
      } else if (value.startsWith('[ ')) {
        icon = '[]';  // Array (even if truncated)
      } else if (value.startsWith('[') && value.endsWith(']')) {
        icon = '[]';  // Array of primitives (JSON stringified)
      } else {
        icon = '-';  // Primitive value (dash)
      }
    } else {
      icon = '-';
    }
  } else if (node.isFile) {
    icon = '📋';
  } else if (node.path && node.path.includes('#')) {
    // This is a nested object within a config file (has # in path but not a config entry)
    icon = '{}';
  } else {
    // This is a directory
    icon = '📁';
  }
  console.log(`${prefix}${connector}${icon} ${node.name}`);
  if (node.children.length > 0) {
    const newPrefix = prefix + (isLast ? '    ' : '│   ');
    node.children.forEach((child, index) => {
      const isLastChild = index === node.children.length - 1;
      printTree(child, newPrefix, isLastChild);
    });
  }
}
