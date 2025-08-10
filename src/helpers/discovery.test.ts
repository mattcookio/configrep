import { test, expect } from 'bun:test';
import { detectFileType } from './discovery';

test('detectFileType detects env files', () => {
  expect(detectFileType('.env')).toBe('env');
  expect(detectFileType('.env.local')).toBe('env');
  expect(detectFileType('my.env')).toBe('env');
  expect(detectFileType('foo.env')).toBe('env');
});

test('detectFileType detects json/yaml/toml/ini', () => {
  expect(detectFileType('foo.json')).toBe('json');
  expect(detectFileType('foo.yaml')).toBe('yaml');
  expect(detectFileType('foo.yml')).toBe('yaml');
  expect(detectFileType('foo.toml')).toBe('toml');
  expect(detectFileType('foo.ini')).toBe('ini');
});

test('detectFileType returns unknown for others', () => {
  expect(detectFileType('foo.txt')).toBe('unknown');
  expect(detectFileType('foo.conf')).toBe('unknown');
});
