import { describe, it, expect } from 'bun:test';
import { buildFilteredTree } from './tree';
import type { ConfigEntry } from '../types';

describe('Tree Display Modes', () => {
  const mockEntries: ConfigEntry[] = [
    { key: 'name', value: 'test-app', file: '/test/config.json' },
    { key: 'version', value: '1.0.0', file: '/test/config.json' },
    { key: 'database.host', value: 'localhost', file: '/test/config.json' },
    { key: 'database.port', value: '5432', file: '/test/config.json' },
    { key: 'database.credentials.username', value: 'admin', file: '/test/config.json' },
    { key: 'database.credentials.password', value: 'secret', file: '/test/config.json' },
    { key: 'servers[0].name', value: 'primary', file: '/test/config.json' },
    { key: 'servers[0].ip', value: '192.168.1.1', file: '/test/config.json' },
    { key: 'servers[1].name', value: 'backup', file: '/test/config.json' },
    { key: 'servers[1].ip', value: '192.168.1.2', file: '/test/config.json' },
  ];

  describe('Flat Display Mode (default)', () => {
    it('should display all entries with dot notation when useNestedDisplay is false', async () => {
      const tree = await buildFilteredTree(mockEntries, '/test', undefined, false);
      
      expect(tree.name).toBe('Search Results');
      expect(tree.children).toHaveLength(1);
      
      const fileNode = tree.children[0];
      expect(fileNode).toBeDefined();
      expect(fileNode!.name).toBe('config.json');
      expect(fileNode!.isFile).toBe(true);
      
      // All entries should be flat with dot notation
      expect(fileNode!.children).toHaveLength(10);
      
      // Check that entries are displayed with dot notation
      const entryNames = fileNode!.children.map(child => child.name);
      expect(entryNames).toContain('name = test-app');
      expect(entryNames).toContain('version = 1.0.0');
      expect(entryNames).toContain('database.host = localhost');
      expect(entryNames).toContain('database.port = 5432');
      expect(entryNames).toContain('database.credentials.username = admin');
      expect(entryNames).toContain('database.credentials.password = secret');
      expect(entryNames).toContain('servers[0].name = primary');
      expect(entryNames).toContain('servers[0].ip = 192.168.1.1');
      expect(entryNames).toContain('servers[1].name = backup');
      expect(entryNames).toContain('servers[1].ip = 192.168.1.2');
      
      // All children should be config entries (leaves)
      fileNode!.children.forEach(child => {
        expect(child.isConfigEntry).toBe(true);
        expect(child.children).toHaveLength(0);
      });
    });
  });

  describe('Nested Display Mode (--tree flag)', () => {
    it('should display entries in a hierarchical tree when useNestedDisplay is true', async () => {
      const tree = await buildFilteredTree(mockEntries, '/test', undefined, true);
      
      expect(tree.name).toBe('Search Results');
      expect(tree.children).toHaveLength(1);
      
      const fileNode = tree.children[0];
      expect(fileNode).toBeDefined();
      expect(fileNode!.name).toBe('config.json');
      expect(fileNode!.isFile).toBe(true);
      
      // Should have top-level entries: name, version, database, servers
      expect(fileNode!.children.length).toBeGreaterThan(0);
      
      // Find the database node
      const databaseNode = fileNode!.children.find(child => child.name === 'database');
      expect(databaseNode).toBeDefined();
      expect(databaseNode!.isConfigEntry).toBe(false);
      expect(databaseNode!.children.length).toBeGreaterThan(0);
      
      // Check database children
      const dbChildren = databaseNode!.children;
      const hostNode = dbChildren.find(child => child.name.startsWith('host'));
      const portNode = dbChildren.find(child => child.name.startsWith('port'));
      const credentialsNode = dbChildren.find(child => child.name === 'credentials');
      
      expect(hostNode).toBeDefined();
      expect(hostNode!.name).toBe('host = localhost');
      expect(hostNode!.isConfigEntry).toBe(true);
      
      expect(portNode).toBeDefined();
      expect(portNode!.name).toBe('port = 5432');
      expect(portNode!.isConfigEntry).toBe(true);
      
      expect(credentialsNode).toBeDefined();
      expect(credentialsNode!.isConfigEntry).toBe(false);
      expect(credentialsNode!.children.length).toBe(2);
      
      // Check credentials children
      const usernameNode = credentialsNode!.children.find(child => child.name.startsWith('username'));
      const passwordNode = credentialsNode!.children.find(child => child.name.startsWith('password'));
      
      expect(usernameNode).toBeDefined();
      expect(usernameNode!.name).toBe('username = admin');
      expect(usernameNode!.isConfigEntry).toBe(true);
      
      expect(passwordNode).toBeDefined();
      expect(passwordNode!.name).toBe('password = secret');
      expect(passwordNode!.isConfigEntry).toBe(true);
      
      // Find the servers node
      const serversNode = fileNode!.children.find(child => child.name === 'servers');
      expect(serversNode).toBeDefined();
      expect(serversNode!.isConfigEntry).toBe(false);
      expect(serversNode!.children.length).toBe(2);
      
      // Check servers array items
      const server0 = serversNode!.children.find(child => child.name === '0');
      const server1 = serversNode!.children.find(child => child.name === '1');
      
      expect(server0).toBeDefined();
      expect(server0!.isConfigEntry).toBe(false);
      expect(server0!.children.length).toBe(2);
      
      expect(server1).toBeDefined();
      expect(server1!.isConfigEntry).toBe(false);
      expect(server1!.children.length).toBe(2);
    });
  });

  describe('File Type Handling', () => {
    it('should use flat display for .env files regardless of useNestedDisplay', async () => {
      const envEntries: ConfigEntry[] = [
        { key: 'DATABASE_URL', value: 'postgres://localhost', file: '/test/.env' },
        { key: 'API_KEY', value: 'secret123', file: '/test/.env' }
      ];
      
      // Even with useNestedDisplay=true, .env files should be flat
      const tree = await buildFilteredTree(envEntries, '/test', undefined, true);
      
      const fileNode = tree.children[0];
      expect(fileNode).toBeDefined();
      expect(fileNode!.name).toBe('.env');
      
      // Should have flat entries
      expect(fileNode!.children).toHaveLength(2);
      fileNode!.children.forEach(child => {
        expect(child.isConfigEntry).toBe(true);
        expect(child.children).toHaveLength(0);
      });
    });
    
    it('should use flat display for .ini files regardless of useNestedDisplay', async () => {
      const iniEntries: ConfigEntry[] = [
        { key: 'section.key1', value: 'value1', file: '/test/config.ini' },
        { key: 'section.key2', value: 'value2', file: '/test/config.ini' }
      ];
      
      // Even with useNestedDisplay=true, .ini files should be flat
      const tree = await buildFilteredTree(iniEntries, '/test', undefined, true);
      
      const fileNode = tree.children[0];
      expect(fileNode).toBeDefined();
      expect(fileNode!.name).toBe('config.ini');
      
      // Should have flat entries
      expect(fileNode!.children).toHaveLength(2);
      fileNode!.children.forEach(child => {
        expect(child.isConfigEntry).toBe(true);
        expect(child.children).toHaveLength(0);
      });
    });
  });

  describe('Icon Assignment', () => {
    it('should use correct icons for different node types', async () => {
      const tree = await buildFilteredTree(mockEntries, '/test', undefined, true);
      const fileNode = tree.children[0];
      expect(fileNode).toBeDefined();
      
      // File nodes should be marked as files
      expect(fileNode!.isFile).toBe(true);
      
      // Nested objects should not be config entries
      const databaseNode = fileNode!.children.find(child => child.name === 'database');
      expect(databaseNode).toBeDefined();
      expect(databaseNode!.isConfigEntry).toBe(false);
      expect(databaseNode!.isFile).toBe(false);
      
      // Leaf nodes should be config entries
      const nameNode = fileNode!.children.find(child => child.name.startsWith('name'));
      expect(nameNode).toBeDefined();
      expect(nameNode!.isConfigEntry).toBe(true);
      expect(nameNode!.isFile).toBe(false);
    });
  });
});