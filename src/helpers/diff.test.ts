import { describe, it, expect } from 'bun:test';
import { generateJsonPatch, applyPatches, generateReadableDiff } from './diff';

describe('diff', () => {
  describe('generateJsonPatch', () => {
    it('should generate add operations for new properties', () => {
      const oldData = { a: 1 };
      const newData = { a: 1, b: 2 };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        op: 'add',
        path: '/b',
        value: 2
      });
    });

    it('should generate remove operations for deleted properties', () => {
      const oldData = { a: 1, b: 2 };
      const newData = { a: 1 };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        op: 'remove',
        path: '/b'
      });
    });

    it('should generate replace operations for changed values', () => {
      const oldData = { a: 1, b: 2 };
      const newData = { a: 1, b: 3 };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        op: 'replace',
        path: '/b',
        value: 3,
        oldValue: 2
      });
    });

    it('should handle nested objects', () => {
      const oldData = { config: { port: 3000, host: 'localhost' } };
      const newData = { config: { port: 8080, host: 'localhost' } };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        op: 'replace',
        path: '/config/port',
        value: 8080,
        oldValue: 3000
      });
    });

    it('should handle arrays', () => {
      const oldData = { items: [1, 2, 3] };
      const newData = { items: [1, 2, 3, 4] };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(1);
      expect(patches[0]).toEqual({
        op: 'add',
        path: '/items/3',
        value: 4
      });
    });

    it('should handle complex nested changes', () => {
      const oldData = {
        database: {
          host: 'localhost',
          port: 5432,
          credentials: {
            username: 'user',
            password: 'pass'
          }
        }
      };
      const newData = {
        database: {
          host: 'remote-host',
          port: 5432,
          credentials: {
            username: 'admin',
            password: 'pass'
          },
          ssl: true
        }
      };
      
      const patches = generateJsonPatch(oldData, newData);
      
      expect(patches).toHaveLength(3);
      expect(patches.find(p => p.path === '/database/host')).toEqual({
        op: 'replace',
        path: '/database/host',
        value: 'remote-host',
        oldValue: 'localhost'
      });
      expect(patches.find(p => p.path === '/database/credentials/username')).toEqual({
        op: 'replace',
        path: '/database/credentials/username',
        value: 'admin',
        oldValue: 'user'
      });
      expect(patches.find(p => p.path === '/database/ssl')).toEqual({
        op: 'add',
        path: '/database/ssl',
        value: true
      });
    });
  });

  describe('applyPatches', () => {
    it('should apply add operations', () => {
      const data = { a: 1 };
      const patches = [{ op: 'add' as const, path: '/b', value: 2 }];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({ a: 1, b: 2 });
    });

    it('should apply remove operations', () => {
      const data = { a: 1, b: 2 };
      const patches = [{ op: 'remove' as const, path: '/b' }];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({ a: 1 });
    });

    it('should apply replace operations', () => {
      const data = { a: 1, b: 2 };
      const patches = [{ op: 'replace' as const, path: '/b', value: 3 }];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({ a: 1, b: 3 });
    });

    it('should apply multiple patches in sequence', () => {
      const data = { a: 1, b: 2 };
      const patches = [
        { op: 'replace' as const, path: '/a', value: 10 },
        { op: 'add' as const, path: '/c', value: 3 },
        { op: 'remove' as const, path: '/b' }
      ];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({ a: 10, c: 3 });
    });

    it('should handle nested object patches', () => {
      const data = { config: { port: 3000, host: 'localhost' } };
      const patches = [
        { op: 'replace' as const, path: '/config/port', value: 8080 },
        { op: 'add' as const, path: '/config/ssl', value: true }
      ];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({
        config: { port: 8080, host: 'localhost', ssl: true }
      });
    });

    it('should create nested objects when adding to non-existent paths', () => {
      const data = {};
      const patches = [{ op: 'add' as const, path: '/config/database/host', value: 'localhost' }];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({
        config: { database: { host: 'localhost' } }
      });
    });

    it('should not modify original data', () => {
      const data = { a: 1, b: 2 };
      const patches = [{ op: 'replace' as const, path: '/a', value: 10 }];
      
      const result = applyPatches(data, patches);
      
      expect(data).toEqual({ a: 1, b: 2 });
      expect(result).toEqual({ a: 10, b: 2 });
    });

    it('should handle invalid patches gracefully', () => {
      const data = { a: 1 };
      const patches = [{ op: 'remove' as const, path: '/nonexistent/deep/path' }];
      
      const result = applyPatches(data, patches);
      
      expect(result).toEqual({ a: 1 });
    });
  });

  describe('generateReadableDiff', () => {
    it('should format add operations', () => {
      const patches = [{ op: 'add' as const, path: '/newKey', value: 'newValue' }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['+ newKey: "newValue"']);
    });

    it('should format remove operations', () => {
      const patches = [{ op: 'remove' as const, path: '/oldKey', oldValue: 'oldValue' }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['- oldKey: "oldValue"']);
    });

    it('should format replace operations', () => {
      const patches = [{ 
        op: 'replace' as const, 
        path: '/changedKey', 
        value: 'newValue',
        oldValue: 'oldValue'
      }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['~ changedKey: "oldValue" → "newValue"']);
    });

    it('should handle nested paths', () => {
      const patches = [{ 
        op: 'replace' as const, 
        path: '/config/database/host', 
        value: 'remote',
        oldValue: 'localhost'
      }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['~ config.database.host: "localhost" → "remote"']);
    });

    it('should handle root path', () => {
      const patches = [{ op: 'replace' as const, path: '/', value: 'newRoot' }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['~ root: (unknown) → "newRoot"']);
    });

    it('should handle complex values', () => {
      const patches = [{ 
        op: 'add' as const, 
        path: '/config', 
        value: { host: 'localhost', port: 3000 }
      }];
      
      const diff = generateReadableDiff(patches);
      
      expect(diff).toEqual(['+ config: {"host":"localhost","port":3000}']);
    });
  });

  describe('integration tests', () => {
    it('should generate patches and apply them correctly', () => {
      const oldData = {
        app: {
          name: 'myapp',
          version: '1.0.0',
          config: {
            port: 3000,
            debug: false
          }
        }
      };
      
      const newData = {
        app: {
          name: 'myapp',
          version: '1.1.0',
          config: {
            port: 8080,
            debug: true,
            ssl: true
          }
        }
      };
      
      const patches = generateJsonPatch(oldData, newData);
      const result = applyPatches(oldData, patches);
      
      expect(result).toEqual(newData);
    });

    it('should handle empty objects', () => {
      const oldData = {};
      const newData = { a: 1 };
      
      const patches = generateJsonPatch(oldData, newData);
      const result = applyPatches(oldData, patches);
      
      expect(result).toEqual(newData);
    });

    it('should handle identical objects', () => {
      const data = { a: 1, b: { c: 2 } };
      
      const patches = generateJsonPatch(data, data);
      const result = applyPatches(data, patches);
      
      expect(patches).toHaveLength(0);
      expect(result).toEqual(data);
    });
  });
});