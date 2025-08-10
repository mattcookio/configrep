import { test, expect, describe } from 'bun:test';
import { parseJsonFile, parseYamlFile, flattenObject } from './parse';

describe('flattenObject with new array handling', () => {
  test('flattens nested objects with dot notation', () => {
    const entries: any[] = [];
    const obj = {
      database: {
        host: 'localhost',
        port: 5432,
        credentials: {
          username: 'admin',
          password: 'secret'
        }
      }
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'database.host', 
      value: 'localhost', 
      file: 'test.json',
      rawValue: 'localhost'
    });
    expect(entries).toContainEqual({ 
      key: 'database.port', 
      value: '5432', 
      file: 'test.json',
      rawValue: 5432
    });
    expect(entries).toContainEqual({ 
      key: 'database.credentials.username', 
      value: 'admin', 
      file: 'test.json',
      rawValue: 'admin'
    });
    expect(entries).toContainEqual({ 
      key: 'database.credentials.password', 
      value: 'secret', 
      file: 'test.json',
      rawValue: 'secret'
    });
  });

  test('treats arrays of primitives as single values', () => {
    const entries: any[] = [];
    const obj = {
      features: ['auth', 'api', 'websocket'],
      ports: [3000, 3001, 3002],
      tags: []
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'features', 
      value: '["auth","api","websocket"]', 
      file: 'test.json',
      rawValue: ['auth', 'api', 'websocket']
    });
    expect(entries).toContainEqual({ 
      key: 'ports', 
      value: '[3000,3001,3002]', 
      file: 'test.json',
      rawValue: [3000, 3001, 3002]
    });
    expect(entries).toContainEqual({ 
      key: 'tags', 
      value: '[]', 
      file: 'test.json',
      rawValue: []
    });
  });

  test('flattens arrays of objects with index notation', () => {
    const entries: any[] = [];
    const obj = {
      servers: [
        { name: 'web-1', ip: '192.168.1.10', port: 8080 },
        { name: 'web-2', ip: '192.168.1.11', port: 8081 }
      ]
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'servers[0].name', 
      value: 'web-1', 
      file: 'test.json',
      rawValue: 'web-1'
    });
    expect(entries).toContainEqual({ 
      key: 'servers[0].ip', 
      value: '192.168.1.10', 
      file: 'test.json',
      rawValue: '192.168.1.10'
    });
    expect(entries).toContainEqual({ 
      key: 'servers[0].port', 
      value: '8080', 
      file: 'test.json',
      rawValue: 8080
    });
    expect(entries).toContainEqual({ 
      key: 'servers[1].name', 
      value: 'web-2', 
      file: 'test.json',
      rawValue: 'web-2'
    });
    expect(entries).toContainEqual({ 
      key: 'servers[1].ip', 
      value: '192.168.1.11', 
      file: 'test.json',
      rawValue: '192.168.1.11'
    });
    expect(entries).toContainEqual({ 
      key: 'servers[1].port', 
      value: '8081', 
      file: 'test.json',
      rawValue: 8081
    });
  });

  test('handles mixed arrays with objects and primitives', () => {
    const entries: any[] = [];
    const obj = {
      mixed: [
        'string',
        { type: 'object', value: 123 },
        456,
        { type: 'another', value: 789 }
      ]
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    // Mixed arrays with objects should flatten all items
    expect(entries).toContainEqual({ 
      key: 'mixed[0]', 
      value: 'string', 
      file: 'test.json',
      rawValue: 'string'
    });
    expect(entries).toContainEqual({ 
      key: 'mixed[1].type', 
      value: 'object', 
      file: 'test.json',
      rawValue: 'object'
    });
    expect(entries).toContainEqual({ 
      key: 'mixed[1].value', 
      value: '123', 
      file: 'test.json',
      rawValue: 123
    });
    expect(entries).toContainEqual({ 
      key: 'mixed[2]', 
      value: '456', 
      file: 'test.json',
      rawValue: 456
    });
  });

  test('handles deeply nested structures', () => {
    const entries: any[] = [];
    const obj = {
      level1: {
        level2: {
          level3: {
            value: 'deep',
            array: ['a', 'b', 'c']
          }
        }
      }
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'level1.level2.level3.value', 
      value: 'deep', 
      file: 'test.json',
      rawValue: 'deep'
    });
    expect(entries).toContainEqual({ 
      key: 'level1.level2.level3.array', 
      value: '["a","b","c"]', 
      file: 'test.json',
      rawValue: ['a', 'b', 'c']
    });
  });

  test('handles nested arrays of objects', () => {
    const entries: any[] = [];
    const obj = {
      groups: [
        {
          name: 'group1',
          members: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ]
        }
      ]
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'groups[0].name', 
      value: 'group1', 
      file: 'test.json',
      rawValue: 'group1'
    });
    expect(entries).toContainEqual({ 
      key: 'groups[0].members[0].id', 
      value: '1', 
      file: 'test.json',
      rawValue: 1
    });
    expect(entries).toContainEqual({ 
      key: 'groups[0].members[0].name', 
      value: 'Alice', 
      file: 'test.json',
      rawValue: 'Alice'
    });
    expect(entries).toContainEqual({ 
      key: 'groups[0].members[1].id', 
      value: '2', 
      file: 'test.json',
      rawValue: 2
    });
    expect(entries).toContainEqual({ 
      key: 'groups[0].members[1].name', 
      value: 'Bob', 
      file: 'test.json',
      rawValue: 'Bob'
    });
  });

  test('handles null and undefined values', () => {
    const entries: any[] = [];
    const obj = {
      nullValue: null,
      nested: {
        alsoNull: null
      }
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'nullValue', 
      value: 'null', 
      file: 'test.json',
      rawValue: null
    });
    expect(entries).toContainEqual({ 
      key: 'nested.alsoNull', 
      value: 'null', 
      file: 'test.json',
      rawValue: null
    });
  });

  test('handles boolean values', () => {
    const entries: any[] = [];
    const obj = {
      enabled: true,
      disabled: false,
      settings: {
        debug: true,
        production: false
      }
    };
    
    flattenObject(obj, '', entries, 'test.json');
    
    expect(entries).toContainEqual({ 
      key: 'enabled', 
      value: 'true', 
      file: 'test.json',
      rawValue: true
    });
    expect(entries).toContainEqual({ 
      key: 'disabled', 
      value: 'false', 
      file: 'test.json',
      rawValue: false
    });
    expect(entries).toContainEqual({ 
      key: 'settings.debug', 
      value: 'true', 
      file: 'test.json',
      rawValue: true
    });
  });
});

describe('parseJsonFile with new flattening', () => {
  test('correctly flattens complex JSON structure', () => {
    const content = JSON.stringify({
      database: {
        host: 'localhost',
        ports: [5432, 5433]
      },
      servers: [
        { name: 'web1', ip: '10.0.0.1' },
        { name: 'web2', ip: '10.0.0.2' }
      ],
      features: ['auth', 'api']
    });
    
    const entries = parseJsonFile(content, 'test.json');
    
    // Check flattened structure
    expect(entries.find(e => e.key === 'database.host')).toBeDefined();
    expect(entries.find(e => e.key === 'database.ports')).toBeDefined();
    expect(entries.find(e => e.key === 'servers[0].name')).toBeDefined();
    expect(entries.find(e => e.key === 'servers[1].ip')).toBeDefined();
    expect(entries.find(e => e.key === 'features')).toBeDefined();
    
    // Arrays of primitives should not be flattened
    expect(entries.find(e => e.key === 'features[0]')).toBeUndefined();
    expect(entries.find(e => e.key === 'database.ports[0]')).toBeUndefined();
  });
});

describe('parseYamlFile with new flattening', () => {
  test('correctly flattens complex YAML structure', () => {
    const content = `
database:
  host: localhost
  ports:
    - 5432
    - 5433
servers:
  - name: web1
    ip: 10.0.0.1
  - name: web2
    ip: 10.0.0.2
features:
  - auth
  - api
`;
    
    const entries = parseYamlFile(content, 'test.yaml');
    
    // Check flattened structure
    expect(entries.find(e => e.key === 'database.host')).toBeDefined();
    expect(entries.find(e => e.key === 'database.ports')).toBeDefined();
    expect(entries.find(e => e.key === 'servers[0].name')).toBeDefined();
    expect(entries.find(e => e.key === 'servers[1].ip')).toBeDefined();
    expect(entries.find(e => e.key === 'features')).toBeDefined();
    
    // Arrays of primitives should not be flattened
    expect(entries.find(e => e.key === 'features[0]')).toBeUndefined();
    expect(entries.find(e => e.key === 'database.ports[0]')).toBeUndefined();
  });
});