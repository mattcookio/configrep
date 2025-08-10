import { test, expect, describe } from 'bun:test';
import { mergeConfigWithOptions } from './config';
import type { ConfiGREPConfig } from '../types.ts';

describe('mergeConfigWithOptions', () => {
  test('merges config and options', () => {
    const config: ConfiGREPConfig = {
      directory: '/foo',
      ignore: ['node_modules'],
      depth: 3
    };
    const options = { dir: '/bar', depth: 2 };
    const merged = mergeConfigWithOptions(config, options);
    expect(merged.dir).toBe('/bar');
    expect(merged.depth).toBe(2);
    expect(merged.ignore).toEqual(['node_modules']);
  });

  test('uses config defaults if options missing', () => {
    const config: ConfiGREPConfig = {
      directory: '/foo',
      ignore: ['node_modules'],
      depth: 3
    };
    const options = {};
    const merged = mergeConfigWithOptions(config, options);
    expect(merged.dir).toBe('/foo');
    expect(merged.depth).toBe(3);
    expect(merged.ignore).toEqual(['node_modules']);
  });

  test('uses default ignore patterns when no config or options provided', () => {
    const config: ConfiGREPConfig = {}; // No config file
    const options = {}; // No CLI options
    const merged = mergeConfigWithOptions(config, options, false);
    expect(merged.ignore).toEqual(['node_modules', 'dist', 'build', 'coverage', '.git', '*.tmp', '*.log']);
  });

  test('uses config ignore patterns when config has them', () => {
    const config: ConfiGREPConfig = { ignore: ['custom', 'patterns'] };
    const options = {};
    const merged = mergeConfigWithOptions(config, options, false);
    expect(merged.ignore).toEqual(['custom', 'patterns']);
  });

  test('uses CLI ignore patterns when explicitly provided', () => {
    const config: ConfiGREPConfig = { ignore: ['config-patterns'] };
    const options = { ignore: ['cli-patterns'] };
    const merged = mergeConfigWithOptions(config, options, true); // ignoreExplicitlyProvided = true
    expect(merged.ignore).toEqual(['cli-patterns']);
  });

  test('uses default ignore patterns when config has empty ignore array', () => {
    const config: ConfiGREPConfig = { ignore: [] }; // Empty ignore array in config
    const options = {};
    const merged = mergeConfigWithOptions(config, options, false);
    expect(merged.ignore).toEqual(['node_modules', 'dist', 'build', 'coverage', '.git', '*.tmp', '*.log']);
  });

  test('respects empty CLI ignore patterns when explicitly provided', () => {
    const config: ConfiGREPConfig = { ignore: ['config-patterns'] };
    const options = { ignore: [] };
    const merged = mergeConfigWithOptions(config, options, true); // ignoreExplicitlyProvided = true
    // When user explicitly provides empty ignore array, it means "don't ignore anything"
    expect(merged.ignore).toEqual([]);
  });
});
