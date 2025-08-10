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
    { key: 'baz', value: '{"qux":42}', file: 'test.json', rawValue: { qux: 42 } },
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

test('parseIniFile parses sections and keys', () => {
  const content = '[section]\nfoo=bar\nbaz=qux';
  const entries = parseIniFile(content, 'test.ini');
  expect(entries).toEqual([
    { key: 'section.foo', value: 'bar', file: 'test.ini' },
    { key: 'section.baz', value: 'qux', file: 'test.ini' },
  ]);
});

test('parseIniFile parses keys outside sections', () => {
  const content = 'foo=bar\n[section]\nbaz=qux';
  const entries = parseIniFile(content, 'test.ini');
  expect(entries).toEqual([
    { key: 'foo', value: 'bar', file: 'test.ini' },
    { key: 'section.baz', value: 'qux', file: 'test.ini' },
  ]);
});
