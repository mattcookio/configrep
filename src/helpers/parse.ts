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
    const sectionKeys = Object.keys(sectionData).sort();
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
      for (const [key, value] of Object.entries(sectionData).sort(([a], [b]) => a.localeCompare(b))) {
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
  for (const [key, value] of Object.entries(obj).sort(([a], [b]) => a.localeCompare(b))) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        // Check if it's an array of objects
        const hasObjects = value.some(item => typeof item === 'object' && item !== null);
        
        if (hasObjects) {
          // Add entry for the array itself with a preview
          const preview = value.slice(0, 2).map((item) => {
            if (typeof item === 'object' && item !== null) {
              const keys = Object.keys(item).sort().slice(0, 2).join(', ');
              return `{${keys}...}`;
            }
            return JSON.stringify(item);
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
              const itemKeys = Object.keys(item).sort();
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
        const objKeys = Object.keys(value).sort();
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

/**
 * Reconstruction functions - Convert JavaScript objects back to various config formats
 */

/**
 * Convert a JavaScript object to INI format
 * @param obj - The object to convert
 * @returns INI format string
 */
export function objectToIni(obj: any): string {
  const lines: string[] = [];
  const sections: Record<string, Record<string, any>> = {};
  const rootKeys: Record<string, any> = {};
  
  // Separate root keys from sectioned keys
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sections[key] = value;
    } else {
      rootKeys[key] = value;
    }
  }
  
  // Add root keys first (keys without sections)
  for (const [key, value] of Object.entries(rootKeys)) {
    let formattedValue: string;
    if (Array.isArray(value)) {
      // Handle arrays - if they contain objects, stringify them
      formattedValue = value.map(item => 
        typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)
      ).join(',');
    } else {
      formattedValue = String(value);
    }
    lines.push(`${key}=${formattedValue}`);
  }
  
  // Add sections
  for (const [sectionName, sectionObj] of Object.entries(sections)) {
    if (lines.length > 0) lines.push(''); // Empty line before section
    lines.push(`[${sectionName}]`);
    
    for (const [key, value] of Object.entries(sectionObj)) {
      let formattedValue: string;
      if (Array.isArray(value)) {
        // Handle arrays - if they contain objects, stringify them
        formattedValue = value.map(item => 
          typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)
        ).join(',');
      } else if (typeof value === 'object' && value !== null) {
        formattedValue = JSON.stringify(value);
      } else {
        formattedValue = String(value);
      }
      lines.push(`${key}=${formattedValue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert a JavaScript object to YAML format
 * @param obj - The object to convert
 * @returns YAML format string
 */
export function objectToYaml(obj: any): string {
  return YAML.stringify(obj);
}

/**
 * Convert a JavaScript object to TOML format
 * @param obj - The object to convert
 * @returns TOML format string
 */
export function objectToToml(obj: any): string {
  const lines: string[] = [];
  const tables: Record<string, any> = {};
  const rootKeys: Record<string, any> = {};
  
  // Separate root keys from tables
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      tables[key] = value;
    } else {
      rootKeys[key] = value;
    }
  }
  
  // Add root keys first
  for (const [key, value] of Object.entries(rootKeys)) {
    let formattedValue: string;
    if (typeof value === 'string') {
      formattedValue = `"${value.replace(/"/g, '\\"')}"`;
    } else if (Array.isArray(value)) {
      const arrayItems = value.map(item => {
        if (typeof item === 'string') {
          return `"${item.replace(/"/g, '\\"')}"`;
        } else if (typeof item === 'object' && item !== null) {
          return JSON.stringify(item);
        } else {
          return String(item);
        }
      });
      formattedValue = `[${arrayItems.join(', ')}]`;
    } else {
      formattedValue = String(value);
    }
    lines.push(`${key} = ${formattedValue}`);
  }
  
  // Add tables
  for (const [tableName, tableObj] of Object.entries(tables)) {
    if (lines.length > 0) lines.push(''); // Empty line before table
    lines.push(`[${tableName}]`);
    
    for (const [key, value] of Object.entries(tableObj)) {
      let formattedValue: string;
      if (typeof value === 'string') {
        formattedValue = `"${value.replace(/"/g, '\\"')}"`;
      } else if (Array.isArray(value)) {
        const arrayItems = value.map(item => {
          if (typeof item === 'string') {
            return `"${item.replace(/"/g, '\\"')}"`;
          } else if (typeof item === 'object' && item !== null) {
            return JSON.stringify(item);
          } else {
            return String(item);
          }
        });
        formattedValue = `[${arrayItems.join(', ')}]`;
      } else if (typeof value === 'object' && value !== null) {
        formattedValue = JSON.stringify(value);
      } else {
        formattedValue = String(value);
      }
      lines.push(`${key} = ${formattedValue}`);
    }
  }
  
  return lines.join('\n');
}

/**
 * Convert a JavaScript object to ENV format (flattened with dot notation)
 * @param obj - The object to convert
 * @param prefix - Optional prefix for keys
 * @returns ENV format string
 */
export function objectToEnv(obj: any, prefix: string = ''): string {
  const lines: string[] = [];
  
  function flattenToEnv(value: any, keyPath: string) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively flatten nested objects
      for (const [key, val] of Object.entries(value)) {
        const newPath = keyPath ? `${keyPath}.${key}` : key;
        flattenToEnv(val, newPath);
      }
    } else {
      // Convert to env format - normalize key to uppercase with underscores
      const envKey = keyPath
        .toUpperCase()
        .replace(/[.\-\s]/g, '_')  // Replace dots, dashes, and spaces with underscores
        .replace(/[^A-Z0-9_]/g, ''); // Remove any other special characters
      
      let envValue: string;
      
      if (Array.isArray(value)) {
        // Handle arrays - if they contain objects, stringify them
        envValue = value.map(item => 
          typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item)
        ).join(',');
      } else if (typeof value === 'string' && (value.includes(' ') || value.includes('"') || value.includes('\n'))) {
        envValue = `"${value.replace(/"/g, '\\"')}"`;
      } else {
        envValue = String(value);
      }
      
      lines.push(`${envKey}=${envValue}`);
    }
  }
  
  flattenToEnv(obj, prefix);
  return lines.join('\n');
}

/**
 * Convert a JavaScript object to the specified format
 * @param obj - The object to convert
 * @param format - Target format
 * @returns Formatted string
 */
export function objectToFormat(obj: any, format: 'json' | 'yaml' | 'toml' | 'ini' | 'env'): string {
  switch (format) {
    case 'json':
      return JSON.stringify(obj, null, 2);
    case 'yaml':
      return objectToYaml(obj);
    case 'toml':
      return objectToToml(obj);
    case 'ini':
      return objectToIni(obj);
    case 'env':
      return objectToEnv(obj);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}
