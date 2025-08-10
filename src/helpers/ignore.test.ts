import { test, expect } from 'bun:test';
import { globToRegex, matchesPathSegments, matchesAnyPathSegment, matchesGlobPattern, shouldIgnore } from './ignore';
import { join } from 'path';

test('globToRegex simple wildcards', () => {
  expect(globToRegex('*.json').test('foo.json')).toBe(true);
  expect(globToRegex('*.json').test('foo.yaml')).toBe(false);
  expect(globToRegex('config.*').test('config.json')).toBe(true);
  expect(globToRegex('config.*').test('config.yaml')).toBe(true);
});

test('matchesPathSegments', () => {
  expect(matchesPathSegments('foo/bar', 'foo/bar')).toBe(true);
  expect(matchesPathSegments('foo/bar', 'baz/foo/bar')).toBe(true);
  expect(matchesPathSegments('foo/bar', 'foo/baz/bar')).toBe(false);
});

test('matchesAnyPathSegment', () => {
  expect(matchesAnyPathSegment('bar', 'foo/bar/baz')).toBe(true);
  expect(matchesAnyPathSegment('baz', 'foo/bar/baz')).toBe(true);
  expect(matchesAnyPathSegment('qux', 'foo/bar/baz')).toBe(false);
});

test('matchesGlobPattern', () => {
  const root = '/project';
  const file = join(root, 'foo', 'bar.json');
  expect(matchesGlobPattern('*.json', 'bar.json', file, root)).toBe(true);
  expect(matchesGlobPattern('foo/*.json', 'bar.json', file, root)).toBe(true);
  expect(matchesGlobPattern('baz/*.json', 'bar.json', file, root)).toBe(false);
});

test('shouldIgnore', () => {
  const root = '/project';
  const file = join(root, 'foo', 'bar.json');
  expect(shouldIgnore('bar.json', file, ['*.json'], root)).toBe(true);
  expect(shouldIgnore('bar.json', file, ['baz/*.json'], root)).toBe(false);
  expect(shouldIgnore('bar.json', file, ['foo/*.json'], root)).toBe(true);
});
