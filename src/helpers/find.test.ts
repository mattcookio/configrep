import { describe, expect, test } from 'bun:test';
import type { ConfigFile, ConfigEntry } from '../types';
import {
  normalizeKey,
  calculateMatchScore,
  matchesNestedPath,
  findMatchingKeys,
  convertValue,
  parseComplexValue,
  formatValueForType,
  containsEnvVariables,
  extractEnvVariables
} from './find';

describe('normalizeKey', () => {
  test('splits snake_case keys', () => {
    expect(normalizeKey('DATABASE_HOST')).toEqual(['database', 'host']);
    expect(normalizeKey('API_KEY')).toEqual(['api', 'key']);
    expect(normalizeKey('SOME_OTHER_NAME')).toEqual(['some', 'other', 'name']);
  });

  test('splits camelCase keys', () => {
    expect(normalizeKey('databaseHost')).toEqual(['database', 'host']);
    expect(normalizeKey('apiKey')).toEqual(['api', 'key']);
    expect(normalizeKey('someOtherName')).toEqual(['some', 'other', 'name']);
  });

  test('splits kebab-case keys', () => {
    expect(normalizeKey('database-host')).toEqual(['database', 'host']);
    expect(normalizeKey('api-key')).toEqual(['api', 'key']);
    expect(normalizeKey('some-other-name')).toEqual(['some', 'other', 'name']);
  });

  test('splits dot notation keys', () => {
    expect(normalizeKey('database.host')).toEqual(['database', 'host']);
    expect(normalizeKey('api.key')).toEqual(['api', 'key']);
    expect(normalizeKey('some.other.name')).toEqual(['some', 'other', 'name']);
  });

  test('handles mixed formats', () => {
    expect(normalizeKey('DATABASE_host')).toEqual(['database', 'host']);
    expect(normalizeKey('api.KEY')).toEqual(['api', 'key']);
    expect(normalizeKey('some-otherName')).toEqual(['some', 'other', 'name']);
  });

  test('handles single word keys', () => {
    expect(normalizeKey('PORT')).toEqual(['port']);
    expect(normalizeKey('port')).toEqual(['port']);
    expect(normalizeKey('p')).toEqual(['p']);
  });
});

describe('calculateMatchScore', () => {
  test('exact matches score 1.0', () => {
    expect(calculateMatchScore(['database', 'host'], ['database', 'host'])).toBe(1.0);
    expect(calculateMatchScore(['api', 'key'], ['api', 'key'])).toBe(1.0);
  });

  test('completely different keys score 0', () => {
    expect(calculateMatchScore(['database', 'host'], ['api', 'key'])).toBe(0);
    expect(calculateMatchScore(['foo'], ['bar'])).toBe(0);
  });

  test('partial matches score between 0 and 1', () => {
    const score = calculateMatchScore(['database', 'host'], ['database', 'port']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  test('order matters for scoring', () => {
    const score1 = calculateMatchScore(['host', 'database'], ['database', 'host']);
    expect(score1).toBeGreaterThan(0);
    expect(score1).toBeLessThan(1);
  });

  test('subset matches score proportionally', () => {
    const score = calculateMatchScore(['database'], ['database', 'host']);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });
});

describe('matchesNestedPath', () => {
  test('matches exact nested paths', () => {
    expect(matchesNestedPath('DATABASE_HOST', ['database', 'host'])).toBe(true);
    expect(matchesNestedPath('API_KEY', ['api', 'key'])).toBe(true);
  });

  test('matches regardless of case format', () => {
    expect(matchesNestedPath('database_host', ['database', 'host'])).toBe(true);
    expect(matchesNestedPath('databaseHost', ['database', 'host'])).toBe(true);
    expect(matchesNestedPath('database-host', ['database', 'host'])).toBe(true);
  });

  test('does not match different paths', () => {
    expect(matchesNestedPath('DATABASE_HOST', ['api', 'key'])).toBe(false);
    expect(matchesNestedPath('DATABASE_HOST', ['database', 'port'])).toBe(false);
  });

  test('matches partial paths', () => {
    expect(matchesNestedPath('DATABASE', ['database', 'host'])).toBe(true);
    expect(matchesNestedPath('HOST', ['database', 'host'])).toBe(true);
  });
});

describe('findMatchingKeys', () => {
  const currentFile: ConfigFile = {
    path: '/project/.env',
    name: '.env',
    relativePath: '.env',
    type: 'env',
    size: 100,
    depth: 0
  };

  const allConfigs = new Map<string, ConfigEntry[]>([
    ['/project/.env', [
      { key: 'DATABASE_HOST', value: 'localhost', file: '/project/.env' },
      { key: 'API_KEY', value: 'dev-key', file: '/project/.env' }
    ]],
    ['/project/.env.prod', [
      { key: 'DATABASE_HOST', value: 'prod.example.com', file: '/project/.env.prod' },
      { key: 'API_KEY', value: 'prod-key', file: '/project/.env.prod' }
    ]],
    ['/project/config.json', [
      { key: 'database.host', value: 'staging.example.com', file: '/project/config.json' },
      { key: 'apiKey', value: 'staging-key', file: '/project/config.json' }
    ]],
    ['/project/config.ini', [
      { key: 'database', value: '{ host: ini.example.com, port: 5432 }', file: '/project/config.ini', rawValue: { host: 'ini.example.com', port: 5432 } },
      { key: 'database.host', value: 'ini.example.com', file: '/project/config.ini' },
      { key: 'database.port', value: '5432', file: '/project/config.ini' },
      { key: 'api', value: '{ key: ini-api-key }', file: '/project/config.ini', rawValue: { key: 'ini-api-key' } },
      { key: 'api.key', value: 'ini-api-key', file: '/project/config.ini' }
    ]]
  ]);

  test('finds exact key matches', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.key === 'DATABASE_HOST')).toBe(true);
  });

  test('finds case-insensitive and format-variant matches', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    expect(results.length).toBeGreaterThan(0);
    // Should find database_host, databaseHost, database.host (exact but case/format insensitive)
    const apiResults = findMatchingKeys('API_KEY', currentFile, allConfigs);
    expect(apiResults.length).toBeGreaterThan(0);
  });

  test('excludes current file from results', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    expect(results.every(r => r.file.path !== currentFile.path)).toBe(true);
  });

  test('returns exact matches only', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    // All results should be exact matches
    expect(results.length).toBeGreaterThan(0);
    results.forEach(result => {
      // Normalize both keys to check they match
      const resultKeyNormalized = result.key.toLowerCase().replace(/[_-]/g, '').replace(/\./g, '');
      const targetKeyNormalized = 'DATABASE_HOST'.toLowerCase().replace(/[_-]/g, '').replace(/\./g, '');
      expect(resultKeyNormalized).toBe(targetKeyNormalized);
    });
  });

  test('finds matches across INI sections', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    // Should find database.host from INI file
    const iniMatch = results.find(r => r.file.path === '/project/config.ini' && r.key === 'database.host');
    expect(iniMatch).toBeDefined();
    expect(iniMatch?.value).toBe('ini.example.com');
  });

  test('finds API key matches in INI files', () => {
    const results = findMatchingKeys('API_KEY', currentFile, allConfigs);
    // Should find api.key from INI file
    const iniMatch = results.find(r => r.file.path === '/project/config.ini' && r.key === 'api.key');
    expect(iniMatch).toBeDefined();
    expect(iniMatch?.value).toBe('ini-api-key');
  });

  test('excludes INI section objects from primitive key matches', () => {
    const results = findMatchingKeys('DATABASE_HOST', currentFile, allConfigs);
    // Should not include the section object itself (database = { ... })
    const sectionMatch = results.find(r => r.key === 'database');
    expect(sectionMatch).toBeUndefined();
  });
});

describe('convertValue', () => {
  test('converts string to string', () => {
    const result = convertValue('localhost', 'env', 'env', 'DATABASE_HOST');
    expect(result.success).toBe(true);
    expect(result.value).toBe('localhost');
  });

  test('converts boolean from JSON to env string', () => {
    const result = convertValue(true, 'json', 'env', 'ENABLED');
    expect(result.success).toBe(true);
    expect(result.value).toBe('true');
  });

  test('converts number from JSON to env string', () => {
    const result = convertValue(3000, 'json', 'env', 'PORT');
    expect(result.success).toBe(true);
    expect(result.value).toBe('3000');
  });

  test('handles complex objects', () => {
    const complexValue = { host: 'localhost', port: 5432 };
    const result = convertValue(complexValue, 'json', 'env', 'DATABASE_CONFIG');
    expect(result.requiresUserChoice).toBeDefined();
    if (result.requiresUserChoice) {
      expect(result.requiresUserChoice.type).toBe('complex_object');
    }
  });

  test('handles arrays', () => {
    const arrayValue = ['localhost', '127.0.0.1', 'example.com'];
    const result = convertValue(arrayValue, 'json', 'env', 'ALLOWED_HOSTS');
    expect(result.success).toBe(true);
    expect(result.value).toBe('localhost,127.0.0.1,example.com');
  });

  test('preserves env variables', () => {
    const result = convertValue('${HOST}:${PORT}', 'env', 'env', 'URL');
    expect(result.warning).toContain('environment variable');
  });
});

describe('parseComplexValue', () => {
  test('parses JSON strings', () => {
    const result = parseComplexValue('{"host":"localhost","port":5432}');
    expect(result).toEqual({ host: 'localhost', port: 5432 });
  });

  test('parses JSON arrays', () => {
    const result = parseComplexValue('["item1","item2","item3"]');
    expect(result).toEqual(['item1', 'item2', 'item3']);
  });

  test('returns original string if not JSON', () => {
    const result = parseComplexValue('not json');
    expect(result).toBe('not json');
  });

  test('handles malformed JSON', () => {
    const result = parseComplexValue('{invalid json}');
    expect(result).toBe('{invalid json}');
  });
});

describe('formatValueForType', () => {
  test('formats string for env file', () => {
    const result = formatValueForType('hello world', 'env', 'MESSAGE');
    expect(result).toBe('hello world');
  });

  test('formats string with quotes for env if needed', () => {
    const result = formatValueForType('hello "world"', 'env', 'MESSAGE');
    expect(result).toBe('"hello \\"world\\""');
  });

  test('formats boolean for JSON', () => {
    const result = formatValueForType(true, 'json', 'enabled');
    expect(result).toBe('true');
  });

  test('formats number for JSON', () => {
    const result = formatValueForType(3000, 'json', 'port');
    expect(result).toBe('3000');
  });

  test('formats array for env as comma-separated', () => {
    const result = formatValueForType(['a', 'b', 'c'], 'env', 'LIST');
    expect(result).toBe('a,b,c');
  });

  test('formats object for JSON', () => {
    const result = formatValueForType({ key: 'value' }, 'json', 'config');
    expect(result).toBe('{"key":"value"}');
  });
});

describe('containsEnvVariables', () => {
  test('detects ${VAR} format', () => {
    expect(containsEnvVariables('${HOST}')).toBe(true);
    expect(containsEnvVariables('http://${HOST}:${PORT}')).toBe(true);
  });

  test('detects $VAR format', () => {
    expect(containsEnvVariables('$HOST')).toBe(true);
    expect(containsEnvVariables('http://$HOST:$PORT')).toBe(true);
  });

  test('returns false for no variables', () => {
    expect(containsEnvVariables('localhost')).toBe(false);
    expect(containsEnvVariables('http://localhost:3000')).toBe(false);
  });

  test('handles escaped dollar signs', () => {
    expect(containsEnvVariables('\\$HOST')).toBe(false);
    expect(containsEnvVariables('\\${HOST}')).toBe(false);
  });
});

describe('extractEnvVariables', () => {
  test('extracts ${VAR} format variables', () => {
    expect(extractEnvVariables('${HOST}')).toEqual(['HOST']);
    expect(extractEnvVariables('${HOST}:${PORT}')).toEqual(['HOST', 'PORT']);
  });

  test('extracts $VAR format variables', () => {
    expect(extractEnvVariables('$HOST')).toEqual(['HOST']);
    expect(extractEnvVariables('$HOST:$PORT')).toEqual(['HOST', 'PORT']);
  });

  test('handles mixed formats', () => {
    expect(extractEnvVariables('${HOST}:$PORT')).toEqual(['HOST', 'PORT']);
  });

  test('returns empty array for no variables', () => {
    expect(extractEnvVariables('localhost')).toEqual([]);
  });

  test('handles duplicates', () => {
    expect(extractEnvVariables('${HOST}:${HOST}')).toEqual(['HOST']);
  });
});