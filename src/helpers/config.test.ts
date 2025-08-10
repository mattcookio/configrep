import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { mergeConfigWithOptions, createExampleConfig, loadConfigFile } from './config';
import type { ConfiGREPConfig } from '../types.ts';
import { join } from 'path';
import { rm, readFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

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

describe('createExampleConfig', () => {
  const testDir = join(import.meta.dir, '../../tests/tmp-config-test');
  
  beforeAll(async () => {
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
  });
  
  afterAll(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
  });
  
  test('creates example config file', async () => {
    await createExampleConfig(testDir);
    const configPath = join(testDir, 'configrep.json');
    expect(existsSync(configPath)).toBe(true);
    
    const content = await readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config.directory).toBe('.');
    expect(config.depth).toBe(5);
    expect(config.defaultCommand).toBe('interactive');
    expect(config.ignore).toContain('node_modules');
  });
  
  test('throws error if config already exists', async () => {
    // Config already created in previous test
    expect(createExampleConfig(testDir)).rejects.toThrow('configrep.json already exists');
  });
});

describe('loadConfigFile', () => {
  test('loads config from current directory', async () => {
    const config = await loadConfigFile();
    // Should return empty object if no config file exists
    expect(config).toBeDefined();
  });
});
