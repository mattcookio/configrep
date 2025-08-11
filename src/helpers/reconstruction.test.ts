import { describe, test, expect } from 'bun:test';
import { objectToIni, objectToYaml, objectToToml, objectToEnv, objectToFormat } from './parse.ts';

describe('Format Reconstruction', () => {
  const testData = {
    // Primitive types
    stringValue: 'hello world',
    numberValue: 42,
    booleanValue: true,
    nullValue: null,
    
    // Arrays
    stringArray: ['item1', 'item2', 'item3'],
    numberArray: [1, 2, 3],
    mixedArray: ['string', 42, true],
    
    // Nested objects
    database: {
      host: 'localhost',
      port: 5432,
      ssl: true,
      credentials: {
        username: 'admin',
        password: 'secret123'
      }
    },
    
    // Complex structures
    servers: ['api.example.com', 'db.example.com'],
    config: {
      timeout: 30,
      retries: 3,
      features: ['auth', 'logging', 'metrics']
    }
  };

  describe('objectToIni', () => {
    test('should convert simple object to INI format', () => {
      const simple = { key1: 'value1', key2: 42, key3: true };
      const result = objectToIni(simple);
      
      expect(result).toContain('key1=value1');
      expect(result).toContain('key2=42');
      expect(result).toContain('key3=true');
    });

    test('should handle nested objects as sections', () => {
      const nested = { 
        root: 'value',
        section1: { key1: 'value1', key2: 'value2' }
      };
      const result = objectToIni(nested);
      
      expect(result).toContain('root=value');
      expect(result).toContain('[section1]');
      expect(result).toContain('key1=value1');
      expect(result).toContain('key2=value2');
    });

    test('should handle arrays as comma-separated values', () => {
      const withArray = { items: ['a', 'b', 'c'] };
      const result = objectToIni(withArray);
      
      expect(result).toContain('items=a,b,c');
    });

    test('should handle complex nested structure', () => {
      const result = objectToIni(testData);
      
      expect(result).toContain('stringValue=hello world');
      expect(result).toContain('numberValue=42');
      expect(result).toContain('booleanValue=true');
      expect(result).toContain('[database]');
      expect(result).toContain('host=localhost');
      expect(result).toContain('port=5432');
    });
  });

  describe('objectToYaml', () => {
    test('should convert object to YAML format', () => {
      const simple = { key1: 'value1', key2: 42, nested: { key3: true } };
      const result = objectToYaml(simple);
      
      expect(result).toContain('key1: value1');
      expect(result).toContain('key2: 42');
      expect(result).toContain('nested:');
      expect(result).toContain('  key3: true');
    });

    test('should handle arrays properly', () => {
      const withArray = { items: ['a', 'b', 'c'] };
      const result = objectToYaml(withArray);
      
      expect(result).toContain('items:');
      expect(result).toContain('- a');
      expect(result).toContain('- b');
      expect(result).toContain('- c');
    });

    test('should preserve data types', () => {
      const typed = { str: 'text', num: 42, bool: true, nil: null };
      const result = objectToYaml(typed);
      
      expect(result).toContain('str: text');
      expect(result).toContain('num: 42');
      expect(result).toContain('bool: true');
      expect(result).toContain('nil: null');
    });
  });

  describe('objectToToml', () => {
    test('should convert simple object to TOML format', () => {
      const simple = { key1: 'value1', key2: 42, key3: true };
      const result = objectToToml(simple);
      
      expect(result).toContain('key1 = "value1"');
      expect(result).toContain('key2 = 42');
      expect(result).toContain('key3 = true');
    });

    test('should handle nested objects as tables', () => {
      const nested = { 
        root: 'value',
        section1: { key1: 'value1', key2: 42 }
      };
      const result = objectToToml(nested);
      
      expect(result).toContain('root = "value"');
      expect(result).toContain('[section1]');
      expect(result).toContain('key1 = "value1"');
      expect(result).toContain('key2 = 42');
    });

    test('should handle arrays properly', () => {
      const withArray = { items: ['a', 'b', 'c'], numbers: [1, 2, 3] };
      const result = objectToToml(withArray);
      
      expect(result).toContain('items = ["a", "b", "c"]');
      expect(result).toContain('numbers = [1, 2, 3]');
    });

    test('should escape quotes in strings', () => {
      const withQuotes = { message: 'He said "hello"' };
      const result = objectToToml(withQuotes);
      
      expect(result).toContain('message = "He said \\"hello\\""');
    });
  });

  describe('objectToEnv', () => {
    test('should flatten object to ENV format', () => {
      const nested = { 
        app: { name: 'myapp', port: 3000 },
        db: { host: 'localhost' }
      };
      const result = objectToEnv(nested);
      
      expect(result).toContain('APP_NAME=myapp');
      expect(result).toContain('APP_PORT=3000');
      expect(result).toContain('DB_HOST=localhost');
    });

    test('should handle arrays as comma-separated values', () => {
      const withArray = { features: ['auth', 'logging'] };
      const result = objectToEnv(withArray);
      
      expect(result).toContain('FEATURES=auth,logging');
    });

    test('should quote strings with spaces', () => {
      const withSpaces = { message: 'hello world', simple: 'test' };
      const result = objectToEnv(withSpaces);
      
      expect(result).toContain('MESSAGE="hello world"');
      expect(result).toContain('SIMPLE=test');
    });

    test('should handle deeply nested objects', () => {
      const deep = { 
        level1: { 
          level2: { 
            level3: { value: 'deep' }
          }
        }
      };
      const result = objectToEnv(deep);
      
      expect(result).toContain('LEVEL1_LEVEL2_LEVEL3_VALUE=deep');
    });

    test('should handle prefix parameter', () => {
      const simple = { key: 'value' };
      const result = objectToEnv(simple, 'PREFIX');
      
      expect(result).toContain('PREFIX_KEY=value');
    });
  });

  describe('objectToFormat', () => {
    test('should route to correct format function', () => {
      const data = { key: 'value' };
      
      expect(objectToFormat(data, 'json')).toContain('"key": "value"');
      expect(objectToFormat(data, 'yaml')).toContain('key: value');
      expect(objectToFormat(data, 'toml')).toContain('key = "value"');
      expect(objectToFormat(data, 'ini')).toContain('key=value');
      expect(objectToFormat(data, 'env')).toContain('KEY=value');
    });

    test('should throw error for unsupported format', () => {
      const data = { key: 'value' };
      
      expect(() => objectToFormat(data, 'xml' as any)).toThrow('Unsupported format: xml');
    });
  });

  describe('Data Type Handling', () => {
    test('should handle null values appropriately', () => {
      const withNull = { nullValue: null };
      
      expect(objectToIni(withNull)).toContain('nullValue=null');
      expect(objectToYaml(withNull)).toContain('nullValue: null');
      expect(objectToToml(withNull)).toContain('nullValue = null');
      expect(objectToEnv(withNull)).toContain('NULLVALUE=null');
    });

    test('should handle boolean values appropriately', () => {
      const withBool = { trueValue: true, falseValue: false };
      
      expect(objectToIni(withBool)).toContain('trueValue=true');
      expect(objectToIni(withBool)).toContain('falseValue=false');
      
      expect(objectToYaml(withBool)).toContain('trueValue: true');
      expect(objectToYaml(withBool)).toContain('falseValue: false');
      
      expect(objectToToml(withBool)).toContain('trueValue = true');
      expect(objectToToml(withBool)).toContain('falseValue = false');
      
      expect(objectToEnv(withBool)).toContain('TRUEVALUE=true');
      expect(objectToEnv(withBool)).toContain('FALSEVALUE=false');
    });

    test('should handle number values appropriately', () => {
      const withNumbers = { integer: 42, float: 3.14, negative: -10 };
      
      expect(objectToIni(withNumbers)).toContain('integer=42');
      expect(objectToIni(withNumbers)).toContain('float=3.14');
      expect(objectToIni(withNumbers)).toContain('negative=-10');
      
      expect(objectToYaml(withNumbers)).toContain('integer: 42');
      expect(objectToYaml(withNumbers)).toContain('float: 3.14');
      expect(objectToYaml(withNumbers)).toContain('negative: -10');
      
      expect(objectToToml(withNumbers)).toContain('integer = 42');
      expect(objectToToml(withNumbers)).toContain('float = 3.14');
      expect(objectToToml(withNumbers)).toContain('negative = -10');
      
      expect(objectToEnv(withNumbers)).toContain('INTEGER=42');
      expect(objectToEnv(withNumbers)).toContain('FLOAT=3.14');
      expect(objectToEnv(withNumbers)).toContain('NEGATIVE=-10');
    });
  });

  describe('Complex Nested Structures', () => {
    const complexData = {
      // Multi-level nesting
      app: {
        server: {
          http: {
            port: 8080,
            host: '0.0.0.0',
            ssl: {
              enabled: true,
              cert: '/path/to/cert.pem',
              key: '/path/to/key.pem'
            }
          },
          websocket: {
            port: 8081,
            path: '/ws'
          }
        },
        database: {
          primary: {
            host: 'db1.example.com',
            port: 5432,
            credentials: {
              username: 'admin',
              password: 'secret123'
            }
          },
          replica: {
            host: 'db2.example.com',
            port: 5432
          }
        }
      },
      // Arrays of objects
      services: [
        { name: 'auth', port: 3001, enabled: true },
        { name: 'api', port: 3002, enabled: true },
        { name: 'worker', port: 3003, enabled: false }
      ],
      // Mixed arrays
      environments: ['development', 'staging', 'production'],
      ports: [3000, 3001, 3002, 3003],
      flags: [true, false, true],
      // Arrays with nested objects
      clusters: [
        {
          name: 'cluster-1',
          nodes: [
            { id: 'node-1', ip: '10.0.1.1' },
            { id: 'node-2', ip: '10.0.1.2' }
          ]
        },
        {
          name: 'cluster-2',
          nodes: [
            { id: 'node-3', ip: '10.0.2.1' }
          ]
        }
      ]
    };

    test('should handle deeply nested objects in INI format', () => {
      const result = objectToIni(complexData);
      
      // Root arrays should be comma-separated
      expect(result).toContain('environments=development,staging,production');
      expect(result).toContain('ports=3000,3001,3002,3003');
      expect(result).toContain('flags=true,false,true');
      
      // Nested objects should become sections
      expect(result).toContain('[app]');
      
      // Arrays of objects should be stringified as JSON
      expect(result).toMatch(/services=.*"name":"auth".*"port":3001.*"enabled":true/);
      expect(result).toMatch(/clusters=.*"name":"cluster-1".*"nodes":/);
      
      // Simple arrays should be comma-separated
      expect(result).toContain('environments=development,staging,production');
    });

    test('should handle deeply nested objects in YAML format', () => {
      const result = objectToYaml(complexData);
      
      // Should preserve nested structure
      expect(result).toContain('app:');
      expect(result).toContain('  server:');
      expect(result).toContain('    http:');
      expect(result).toContain('      ssl:');
      expect(result).toContain('        enabled: true');
      
      // Arrays should be properly formatted
      expect(result).toContain('services:');
      expect(result).toContain('  - name: auth');
      expect(result).toContain('    port: 3001');
      expect(result).toContain('    enabled: true');
      
      // Nested arrays in objects
      expect(result).toContain('clusters:');
      expect(result).toContain('  - name: cluster-1');
      expect(result).toContain('    nodes:');
      expect(result).toContain('      - id: node-1');
      expect(result).toContain('        ip: 10.0.1.1');
    });

    test('should handle deeply nested objects in TOML format', () => {
      const result = objectToToml(complexData);
      
      // Root arrays should be properly formatted
      expect(result).toContain('environments = ["development", "staging", "production"]');
      expect(result).toContain('ports = [3000, 3001, 3002, 3003]');
      expect(result).toContain('flags = [true, false, true]');
      
      // Nested objects should become tables
      expect(result).toContain('[app]');
      
      // Arrays of objects should be stringified as JSON in TOML arrays
      expect(result).toMatch(/services = \[.*"name":"auth".*"port":3001.*"enabled":true/);
      expect(result).toMatch(/clusters = \[.*"name":"cluster-1".*"nodes":/);
      
      // Simple arrays should be properly formatted
      expect(result).toContain('environments = ["development", "staging", "production"]');
    });

    test('should handle deeply nested objects in ENV format', () => {
      const result = objectToEnv(complexData);
      
      // Should flatten all nested keys
      expect(result).toContain('APP_SERVER_HTTP_PORT=8080');
      expect(result).toContain('APP_SERVER_HTTP_HOST=0.0.0.0');
      expect(result).toContain('APP_SERVER_HTTP_SSL_ENABLED=true');
      expect(result).toContain('APP_SERVER_HTTP_SSL_CERT=/path/to/cert.pem');
      expect(result).toContain('APP_DATABASE_PRIMARY_HOST=db1.example.com');
      expect(result).toContain('APP_DATABASE_PRIMARY_CREDENTIALS_USERNAME=admin');
      expect(result).toContain('APP_DATABASE_PRIMARY_CREDENTIALS_PASSWORD=secret123');
      
      // Arrays should be comma-separated
      expect(result).toContain('ENVIRONMENTS=development,staging,production');
      expect(result).toContain('PORTS=3000,3001,3002,3003');
      expect(result).toContain('FLAGS=true,false,true');
      
      // Complex arrays should be stringified
      expect(result).toMatch(/SERVICES=.*name.*port.*enabled/);
      expect(result).toMatch(/CLUSTERS=.*name.*nodes/);
    });
  });

  describe('Edge Cases and Special Characters', () => {
    const edgeCaseData = {
      // Special characters in strings
      specialChars: 'Hello "World" with \'quotes\' and\nnewlines\tand\ttabs',
      unicodeText: '🚀 Unicode: café, naïve, résumé',
      emptyString: '',
      whitespace: '   spaces   ',
      
      // Special values
      zeroNumber: 0,
      emptyArray: [],
      emptyObject: {},
      
      // Keys with special characters
      'key-with-dashes': 'value1',
      'key_with_underscores': 'value2',
      'key.with.dots': 'value3',
      'key with spaces': 'value4',
      
      // Nested with special keys
      'section-1': {
        'nested-key': 'nested-value',
        'another.key': 42
      },
      
      // Arrays with special content
      mixedContent: [
        'simple string',
        'string with "quotes"',
        'string\nwith\nnewlines',
        42,
        true,
        null,
        { nested: 'object' }
      ]
    };

    test('should handle special characters in INI format', () => {
      const result = objectToIni(edgeCaseData);
      
      expect(result).toContain('specialChars=');
      expect(result).toContain('unicodeText=🚀 Unicode: café, naïve, résumé');
      expect(result).toContain('emptyString=');
      expect(result).toContain('whitespace=   spaces   ');
      expect(result).toContain('zeroNumber=0');
      expect(result).toContain('emptyArray=');
      
      // Keys with special characters
      expect(result).toContain('key-with-dashes=value1');
      expect(result).toContain('key_with_underscores=value2');
      expect(result).toContain('key.with.dots=value3');
      expect(result).toContain('key with spaces=value4');
      
      // Sections with special characters
      expect(result).toContain('[section-1]');
      expect(result).toContain('nested-key=nested-value');
    });

    test('should handle special characters in YAML format', () => {
      const result = objectToYaml(edgeCaseData);
      
      expect(result).toContain('specialChars:');
      expect(result).toContain('unicodeText: "🚀 Unicode: café, naïve, résumé"');
      expect(result).toContain('emptyString: ""');
      expect(result).toContain('whitespace: "   spaces   "');
      expect(result).toContain('zeroNumber: 0');
      expect(result).toContain('emptyArray: []');
      expect(result).toContain('emptyObject: {}');
      
      // Mixed array content
      expect(result).toContain('mixedContent:');
      expect(result).toContain('  - simple string');
      expect(result).toContain('  - 42');
      expect(result).toContain('  - true');
      expect(result).toContain('  - null');
    });

    test('should handle special characters in TOML format', () => {
      const result = objectToToml(edgeCaseData);
      
      expect(result).toContain('specialChars = ');
      expect(result).toContain('unicodeText = "🚀 Unicode: café, naïve, résumé"');
      expect(result).toContain('emptyString = ""');
      expect(result).toContain('whitespace = "   spaces   "');
      expect(result).toContain('zeroNumber = 0');
      expect(result).toContain('emptyArray = []');
      
      // Quote escaping
      expect(result).toMatch(/specialChars = ".*\\".*"/);
    });

    test('should handle special characters in ENV format', () => {
      const result = objectToEnv(edgeCaseData);
      
      expect(result).toContain('SPECIALCHARS=');
      expect(result).toContain('UNICODETEXT="🚀 Unicode: café, naïve, résumé"');
      expect(result).toContain('EMPTYSTRING=');
      expect(result).toContain('WHITESPACE="   spaces   "');
      expect(result).toContain('ZERONUMBER=0');
      expect(result).toContain('EMPTYARRAY=');
      
      // Keys should be normalized to uppercase with underscores
      expect(result).toContain('KEY_WITH_DASHES=value1');
      expect(result).toContain('KEY_WITH_UNDERSCORES=value2');
      expect(result).toContain('KEY_WITH_DOTS=value3');
      expect(result).toContain('KEY_WITH_SPACES=value4');
      
      // Nested keys with special characters
      expect(result).toContain('SECTION_1_NESTED_KEY=nested-value');
      expect(result).toContain('SECTION_1_ANOTHER_KEY=42');
    });
  });

  describe('Real-world Configuration Examples', () => {
    const realWorldConfig = {
      // Typical web application config
      server: {
        host: '0.0.0.0',
        port: 3000,
        cors: {
          origin: ['http://localhost:3000', 'https://example.com'],
          credentials: true
        }
      },
      
      // Database configuration
      databases: {
        primary: {
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          database: 'myapp',
          pool: {
            min: 2,
            max: 10,
            idle: 10000
          }
        },
        redis: {
          host: 'localhost',
          port: 6379,
          db: 0
        }
      },
      
      // Logging configuration
      logging: {
        level: 'info',
        transports: [
          { type: 'console', colorize: true },
          { type: 'file', filename: 'app.log', maxsize: 10485760 }
        ]
      },
      
      // Feature flags
      features: {
        authentication: true,
        rateLimit: true,
        analytics: false
      },
      
      // External services
      services: {
        email: {
          provider: 'sendgrid',
          apiKey: '${SENDGRID_API_KEY}',
          from: 'noreply@example.com'
        },
        storage: {
          provider: 's3',
          bucket: 'my-app-uploads',
          region: 'us-east-1'
        }
      }
    };

    test('should convert real-world config to all formats correctly', () => {
      // Test that all formats can be generated without errors
      expect(() => objectToIni(realWorldConfig)).not.toThrow();
      expect(() => objectToYaml(realWorldConfig)).not.toThrow();
      expect(() => objectToToml(realWorldConfig)).not.toThrow();
      expect(() => objectToEnv(realWorldConfig)).not.toThrow();
      expect(() => objectToFormat(realWorldConfig, 'json')).not.toThrow();
    });

    test('should preserve environment variable references in ENV format', () => {
      const result = objectToEnv(realWorldConfig);
      expect(result).toContain('SERVICES_EMAIL_APIKEY=${SENDGRID_API_KEY}');
    });

    test('should handle arrays of objects in configuration', () => {
      const result = objectToYaml(realWorldConfig);
      expect(result).toContain('transports:');
      expect(result).toContain('  - type: console');
      expect(result).toContain('    colorize: true');
      expect(result).toContain('  - type: file');
      expect(result).toContain('    filename: app.log');
    });
  });
});