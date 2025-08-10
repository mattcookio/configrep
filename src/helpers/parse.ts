import { readFile } from 'fs/promises';
import * as YAML from 'yaml';
import * as TOML from 'toml';
import type { ConfigFile, ParsedConfig, ConfigEntry } from '../types.ts';

export async function parseConfigFile(configFile: ConfigFile): Promise<ParsedConfig> {
  try {
    const content = await readFile(configFile.path, 'utf-8');
    const entries: ConfigEntry[] = [];
    switch (configFile.type) {
      case 'env':
        entries.push(...parseEnvFile(content, configFile.path));
        break;
      case 'json':
        entries.push(...parseJsonFile(content, configFile.path));
        break;
      case 'yaml':
        entries.push(...parseYamlFile(content, configFile.path));
        break;
      case 'toml':
        entries.push(...parseTomlFile(content, configFile.path));
        break;
      case 'ini':
        entries.push(...parseIniFile(content, configFile.path));
        break;
      default:
        break;
    }
    return { file: configFile, entries };
  } catch (error) {
    return {
      file: configFile,
      entries: [],
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function parseEnvFile(content: string, filePath: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        const value = valueParts.join('=').replace(/^['"]|['"]$/g, '');
        entries.push({ key: key.trim(), value: value.trim(), file: filePath });
      }
    }
  }
  return entries;
}

export function parseJsonFile(content: string, filePath: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  try {
    const json = JSON.parse(content);
    flattenObject(json, '', entries, filePath);
  } catch (error) {
    throw error;
  }
  return entries;
}

export function parseJsonValue(value: string): any {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function parseYamlFile(content: string, filePath: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  try {
    const yamlData = YAML.parse(content);
    if (yamlData && typeof yamlData === 'object') {
      flattenObject(yamlData, '', entries, filePath, true);
    }
  } catch (error) {
    // Fall back to simple parsing if YAML parsing fails
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes(':')) {
        const [key, ...valueParts] = trimmed.split(':');
        if (key) {
          const value = valueParts.join(':').trim().replace(/^['"]|['"]$/g, '');
          if (value) {
            entries.push({ key: key.trim(), value, file: filePath });
          }
        }
      }
    }
  }
  return entries;
}

export function parseTomlFile(content: string, filePath: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  try {
    const tomlData = TOML.parse(content);
    if (tomlData && typeof tomlData === 'object') {
      flattenObject(tomlData, '', entries, filePath, true);
    }
  } catch (error) {
    // Fall back to simple parsing if TOML parsing fails
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
          entries.push({ key: key.trim(), value, file: filePath });
        }
      }
    }
  }
  return entries;
}

export function parseIniFile(content: string, filePath: string): ConfigEntry[] {
  const entries: ConfigEntry[] = [];
  const lines = content.split('\n');
  let currentSection = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
    } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith(';') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        const value = valueParts.join('=').trim();
        const fullKey = currentSection ? `${currentSection}.${key.trim()}` : key.trim();
        entries.push({ key: fullKey, value, file: filePath });
      }
    }
  }
  return entries;
}

export function flattenObject(obj: any, prefix: string, entries: ConfigEntry[], filePath: string, skipChildren = true): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      // Store the object/array itself as a raw value
      entries.push({
        key: fullKey,
        value: JSON.stringify(value),
        file: filePath,
        rawValue: value
      });
      // Always flatten children to make them searchable, even for nested formats
      // We'll filter what to display in the UI
      if (!Array.isArray(value)) {
        flattenObject(value, fullKey, entries, filePath, skipChildren);
      }
    } else {
      // Store primitive values
      entries.push({
        key: fullKey,
        value: String(value),
        file: filePath,
        rawValue: value
      });
    }
  }
}
