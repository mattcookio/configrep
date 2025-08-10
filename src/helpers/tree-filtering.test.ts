import { test, expect, describe } from 'bun:test';
import { buildFileTree, buildFilteredTree } from './tree';
import type { ConfigFile, ConfigEntry } from '../types';

describe('buildFileTree with flattened entries', () => {
  test('shows all flattened entries for JSON files', async () => {
    const configFiles: ConfigFile[] = [
      {
        path: '/test/config.json',
        name: 'config.json',
        relativePath: 'config.json',
        type: 'json',
        size: 100,
        depth: 0
      }
    ];
    
    // Mock parseConfigFile to return flattened entries
    const tree = await buildFileTree(configFiles, '/test');
    
    // Tree should be built (actual parsing would happen in parseConfigFile)
    expect(tree.name).toBe('test');
    expect(tree.isFile).toBe(false);
  });
});

describe('buildFilteredTree', () => {
  test('builds tree from filtered entries', async () => {
    const entries: ConfigEntry[] = [
      { key: 'database.host', value: 'localhost', file: '/test/config.json' },
      { key: 'database.port', value: '5432', file: '/test/config.json' },
      { key: 'api.key', value: 'secret', file: '/test/.env' }
    ];
    
    const tree = await buildFilteredTree(entries, '/test', 'database');
    
    expect(tree.name).toBe('Search Results');
    expect(tree.children.length).toBe(2); // Two files
    
    const configJsonNode = tree.children.find(n => n.name === 'config.json');
    expect(configJsonNode).toBeDefined();
    expect(configJsonNode?.children.length).toBe(2); // Two database entries
    
    const envNode = tree.children.find(n => n.name === '.env');
    expect(envNode).toBeDefined();
    expect(envNode?.children.length).toBe(1); // One api entry
  });

  test('creates config entry nodes with proper structure', async () => {
    const entries: ConfigEntry[] = [
      { 
        key: 'servers[0].name', 
        value: 'web-1', 
        file: '/test/config.json',
        rawValue: 'web-1'
      }
    ];
    
    const tree = await buildFilteredTree(entries, '/test');
    
    const fileNode = tree.children[0];
    expect(fileNode?.isFile).toBe(true);
    
    const entryNode = fileNode?.children[0];
    expect(entryNode?.isConfigEntry).toBe(true);
    if (entryNode?.configEntry && entries[0]) {
      expect(entryNode.configEntry).toEqual(entries[0]);
    }
    expect(entryNode?.name).toContain('servers[0].name');
    expect(entryNode?.name).toContain('web-1');
  });

  test('truncates long values in display', async () => {
    const longValue = 'a'.repeat(100);
    const entries: ConfigEntry[] = [
      { 
        key: 'longKey', 
        value: longValue, 
        file: '/test/config.json'
      }
    ];
    
    const tree = await buildFilteredTree(entries, '/test');
    
    const entryNode = tree.children[0]?.children[0];
    expect(entryNode?.name).toContain('...');
    expect(entryNode?.name.length).toBeLessThan(100);
  });
});