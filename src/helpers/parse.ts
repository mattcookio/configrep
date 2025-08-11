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
  const sections: { [key: string]: { [key: string]: string } } = {};
  let currentSection = '';
  
  // First pass: parse into sections
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1);
      if (!sections[currentSection]) {
        sections[currentSection] = {};
      }
    } else if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith(';') && trimmed.includes('=')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key) {
        const value = valueParts.join('=').trim();
        const cleanKey = key.trim();
        if (currentSection) {
          if (!sections[currentSection]) {
            sections[currentSection] = {};
          }
          sections[currentSection]![cleanKey] = value;
        } else {
          // Root level key
          entries.push({ key: cleanKey, value, file: filePath });
        }
      }
    }
  }
  
  // Second pass: create entries with section objects
  for (const [sectionName, sectionData] of Object.entries(sections)) {
    const sectionKeys = Object.keys(sectionData);
    if (sectionKeys.length > 0) {
      // Create section object entry with preview
      const preview = sectionKeys.slice(0, 3).map(k => {
        const val = sectionData[k];
        return `${k}: ${val || ''}`;
      }).join(', ');
      const moreText = sectionKeys.length > 3 ? `, ... +${sectionKeys.length - 3} more` : '';
      
      entries.push({
        key: sectionName,
        value: `{ ${preview}${moreText} }`,
        file: filePath,
        rawValue: sectionData
      });
      
      // Create individual key entries
      for (const [key, value] of Object.entries(sectionData)) {
        entries.push({
          key: `${sectionName}.${key}`,
          value,
          file: filePath
        });
      }
    }
  }
  
  return entries;
}

export function flattenObject(obj: any, prefix: string, entries: ConfigEntry[], filePath: string, skipChildren = true): void {
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        // Check if it's an array of objects
        const hasObjects = value.some(item => typeof item === 'object' && item !== null);
        
        if (hasObjects) {
          // Add entry for the array itself with a preview
          const preview = value.slice(0, 2).map((item, idx) => {
            if (typeof item === 'object' && item !== null) {
              const keys = Object.keys(item).slice(0, 2).join(', ');
              return `[${idx}]: {${keys}...}`;
            }
            return `[${idx}]: ${JSON.stringify(item)}`;
          }).join(', ');
          const moreText = value.length > 2 ? `, ... +${value.length - 2} more` : '';
          
          entries.push({
            key: fullKey,
            value: `[ ${preview}${moreText} ]`,
            file: filePath,
            rawValue: value
          });
          
          // Array of objects - flatten each object with array index
          value.forEach((item, index) => {
            const arrayKey = `${fullKey}[${index}]`;
            if (typeof item === 'object' && item !== null) {
              // Add entry for each array item object with preview
              const itemKeys = Object.keys(item);
              const preview = itemKeys.slice(0, 3).map(k => `${k}: ${JSON.stringify(item[k])}`).join(', ');
              const moreText = itemKeys.length > 3 ? `, ... +${itemKeys.length - 3} more` : '';
              
              entries.push({
                key: arrayKey,
                value: `{ ${preview}${moreText} }`,
                file: filePath,
                rawValue: item
              });
              
              // Recursively flatten the object in the array
              flattenObject(item, arrayKey, entries, filePath, skipChildren);
            } else {
              // Primitive value in array
              entries.push({
                key: arrayKey,
                value: String(item),
                file: filePath,
                rawValue: item
              });
            }
          });
        } else {
          // Array of primitives - store as end value
          entries.push({
            key: fullKey,
            value: JSON.stringify(value),
            file: filePath,
            rawValue: value
          });
        }
      } else {
        // Regular object - add entry for the object itself with preview
        const objKeys = Object.keys(value);
        const preview = objKeys.slice(0, 3).map(k => {
          const val = value[k as keyof typeof value];
          const valStr = typeof val === 'object' ? '{...}' : JSON.stringify(val);
          return `${k}: ${valStr}`;
        }).join(', ');
        const moreText = objKeys.length > 3 ? `, ... +${objKeys.length - 3} more` : '';
        
        entries.push({
          key: fullKey,
          value: `{ ${preview}${moreText} }`,
          file: filePath,
          rawValue: value
        });
        
        // Always flatten into dot notation
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
