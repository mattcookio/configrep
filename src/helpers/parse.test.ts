import { test, expect } from 'bun:test';
import { parseEnvFile, parseJsonFile, parseYamlFile, parseTomlFile, parseIniFile } from './parse';

test('parseEnvFile parses simple .env', () => {
  const content = 'FOO=bar\nBAZ=qux';
  const entries = parseEnvFile(content, 'test.env');
  expect(entries).toEqual([
    { key: 'FOO', value: 'bar', file: 'test.env' },
    { key: 'BAZ', value: 'qux', file: 'test.env' },
  ]);
});

test('parseEnvFile ignores comments and blank lines', () => {
  const content = '# comment\nFOO=bar\n\nBAZ=qux # inline comment';
  const entries = parseEnvFile(content, 'test.env');
  expect(entries).toEqual([
    { key: 'FOO', value: 'bar', file: 'test.env' },
    { key: 'BAZ', value: 'qux # inline comment', file: 'test.env' },
  ]);
});

test('parseJsonFile parses flat and nested JSON', () => {
  const content = '{"foo": "bar", "baz": {"qux": 42}}';
  const entries = parseJsonFile(content, 'test.json');
  expect(entries).toEqual([
    { key: 'foo', value: 'bar', file: 'test.json', rawValue: 'bar' },
    { key: 'baz', value: '{ qux: 42 }', file: 'test.json', rawValue: { qux: 42 } },
    { key: 'baz.qux', value: '42', file: 'test.json', rawValue: 42 },
  ]);
});

test('parseJsonFile throws on malformed JSON', () => {
  expect(() => parseJsonFile('{foo:bar}', 'bad.json')).toThrow();
});

test('parseYamlFile parses simple YAML', () => {
  const content = 'foo: bar\nbaz: qux';
  const entries = parseYamlFile(content, 'test.yaml');
  expect(entries).toEqual([
    { key: 'foo', value: 'bar', file: 'test.yaml', rawValue: 'bar' },
    { key: 'baz', value: 'qux', file: 'test.yaml', rawValue: 'qux' },
  ]);
});

test('parseTomlFile parses simple TOML', () => {
  const content = 'foo = "bar"\nbaz = 42';
  const entries = parseTomlFile(content, 'test.toml');
  expect(entries).toEqual([
    { key: 'foo', value: 'bar', file: 'test.toml', rawValue: 'bar' },
    { key: 'baz', value: '42', file: 'test.toml', rawValue: 42 },
  ]);
});

test('parseIniFile parses sections and keys with hierarchical structure', () => {
  const content = '[section]\nfoo=bar\nbaz=qux';
  const entries = parseIniFile(content, 'test.ini');
  expect(entries).toEqual([
    { 
      key: 'section', 
      value: '{ foo: bar, baz: qux }', 
      file: 'test.ini',
      rawValue: { foo: 'bar', baz: 'qux' }
    },
    { key: 'section.foo', value: 'bar', file: 'test.ini' },
    { key: 'section.baz', value: 'qux', file: 'test.ini' },
  ]);
});

test('parseIniFile parses keys outside sections', () => {
  const content = 'foo=bar\n[section]\nbaz=qux';
  const entries = parseIniFile(content, 'test.ini');
  expect(entries).toEqual([
    { key: 'foo', value: 'bar', file: 'test.ini' },
    { 
      key: 'section', 
      value: '{ baz: qux }', 
      file: 'test.ini',
      rawValue: { baz: 'qux' }
    },
    { key: 'section.baz', value: 'qux', file: 'test.ini' },
  ]);
});

test('parseIniFile handles multiple sections with previews', () => {
  const content = `[api]
default_version=v1
master_key=mk_live_123
public_key=pk_live_456

[database]
host=localhost
port=5432
name=myapp

[cache]
driver=redis`;
  const entries = parseIniFile(content, 'test.ini');
  
  // Should have section objects and individual keys
  expect(entries.length).toBe(10); // 3 sections + 7 individual keys
  
  // Check section objects
  const apiSection = entries.find(e => e.key === 'api');
  expect(apiSection).toBeDefined();
  expect(apiSection?.value).toContain('default_version: v1');
  expect(apiSection?.value).toContain('master_key: mk_live_123');
  expect(apiSection?.rawValue).toEqual({
    default_version: 'v1',
    master_key: 'mk_live_123',
    public_key: 'pk_live_456'
  });
  
  // Check individual keys
  expect(entries.find(e => e.key === 'api.default_version')?.value).toBe('v1');
  expect(entries.find(e => e.key === 'database.host')?.value).toBe('localhost');
  expect(entries.find(e => e.key === 'cache.driver')?.value).toBe('redis');
});

test('parseIniFile handles sections with many keys (truncated preview)', () => {
  const content = `[section]
key1=value1
key2=value2
key3=value3
key4=value4
key5=value5`;
  const entries = parseIniFile(content, 'test.ini');
  
  const sectionEntry = entries.find(e => e.key === 'section');
  expect(sectionEntry?.value).toContain('key1: value1');
  expect(sectionEntry?.value).toContain('key2: value2');
  expect(sectionEntry?.value).toContain('key3: value3');
  expect(sectionEntry?.value).toContain('... +2 more'); // Should truncate after 3 keys
});
