import { basename, join } from 'path';
import type { ConfigFile, ConfigEntry, TreeNode } from '../types.ts';
import { parseConfigFile } from './parse';

export async function buildFileTree(configFiles: ConfigFile[], rootDirectory: string): Promise<TreeNode> {
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
          // Show all entries including flattened nested values
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

export async function buildFilteredTree(allEntries: ConfigEntry[], rootDirectory: string, _filter?: string): Promise<TreeNode> {
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
    const fileNode: TreeNode = {
      name: fileName,
      path: filePath,
      isFile: true,
      children: entries.map(entry => ({
        name: `${entry.key} = ${entry.value.length > 50 ? entry.value.substring(0, 50) + '...' : entry.value}`,
        path: `${filePath}#${entry.key}`,
        isFile: false,
        isConfigEntry: true,
        children: [],
        configEntry: entry
      })),
      configFile: undefined
    };
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
    icon = '🔑';
  } else if (node.isFile) {
    icon = '📋';
  } else {
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
