import type { ConfigEntry, ConfigFile } from '../types';

/**
 * Represents a matched configuration value from another file
 */
export interface FoundValue {
  file: ConfigFile;
  key: string;
  value: any;
  originalValue: string;
  conversionNeeded: boolean;
  conversionWarning?: string;
}

/**
 * Options for finding matching configuration keys
 */


/**
 * Result of a value conversion attempt
 */
export interface ConversionResult {
  success: boolean;
  value: string;
  warning?: string;
  requiresUserChoice?: ConversionChoice;
}

/**
 * User choice for handling complex conversions
 */
export interface ConversionChoice {
  type: 'complex_object' | 'type_mismatch' | 'env_variables' | 'array_format';
  options: ConversionOption[];
  originalValue: any;
  targetFormat: ConfigFile['type'];
}

/**
 * Individual conversion option presented to user
 */
export interface ConversionOption {
  label: string;
  value: string;
  description?: string;
  isDefault?: boolean;
}

/**
 * Find matching configuration keys across all config files
 * Uses exact case-insensitive matching with support for different naming conventions
 * @param targetKey - The key to search for
 * @param currentFile - The current file (to exclude from results)
 * @param allConfigs - All parsed configuration files
 * @returns Array of found values with exact matches
 */
export function findMatchingKeys(
  targetKey: string,
  currentFile: ConfigFile,
  allConfigs: Map<string, ConfigEntry[]>
): FoundValue[] {
  const results: FoundValue[] = [];
  const targetKeyParts = normalizeKey(targetKey);
  const targetKeyLower = targetKeyParts.join('_').toLowerCase();
  
  for (const [filePath, entries] of allConfigs) {
    // Skip current file
    if (filePath === currentFile.path) {
      continue;
    }
    
    // Create a ConfigFile object for the found file
    const file: ConfigFile = {
      path: filePath,
      name: filePath.split('/').pop() || '',
      relativePath: filePath,
      type: detectFileType(filePath),
      size: 0,
      depth: 0
    };
    
    for (const entry of entries) {
      const entryKeyParts = normalizeKey(entry.key);
      const entryKeyLower = entryKeyParts.join('_').toLowerCase();
      
      // Check for exact match (case-insensitive, normalized)
      if (entryKeyLower === targetKeyLower) {
        // Check if this entry contains a nested object that we should skip
        const entryValue = entry.rawValue !== undefined ? entry.rawValue : parseComplexValue(entry.value);
        
        // Skip entries that are objects/arrays when we're looking for a specific value
        // For example, skip "database.pool" when looking for "database_pool_max"
        if (typeof entryValue === 'object' && entryValue !== null) {
          // This is a parent object, skip it - we want the leaf value
          continue;
        }
        
        results.push({
          file,
          key: entry.key,
          value: entryValue,
          originalValue: entry.value,
          conversionNeeded: file.type !== currentFile.type,
          conversionWarning: undefined
        });
      }
      // Also check if the entry key ends with our target key
      // This handles cases like "database.pool.max" matching "max"
      else if (entryKeyParts.length > targetKeyParts.length) {
        // Check if the last parts of the entry match our target
        const entryTail = entryKeyParts.slice(-targetKeyParts.length);
        const entryTailLower = entryTail.join('_').toLowerCase();
        
        if (entryTailLower === targetKeyLower) {
          const entryValue = entry.rawValue !== undefined ? entry.rawValue : parseComplexValue(entry.value);
          
          // Only include if it's not an object (we want the actual value)
          if (typeof entryValue !== 'object' || entryValue === null) {
            results.push({
              file,
              key: entry.key,
              value: entryValue,
              originalValue: entry.value,
              conversionNeeded: file.type !== currentFile.type,
              conversionWarning: undefined
            });
          }
        }
      }
    }
  }
  
  // Sort by match score (highest first)
  // Return results (no need to sort since all are exact matches)
  return results;
}

// Helper function to detect file type from path
function detectFileType(filePath: string): ConfigFile['type'] {
  const name = filePath.split('/').pop() || '';
  if (name.startsWith('.env')) return 'env';
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.yaml') || name.endsWith('.yml')) return 'yaml';
  if (name.endsWith('.toml')) return 'toml';
  if (name.endsWith('.ini')) return 'ini';
  return 'unknown';
}

/**
 * Normalize a key for fuzzy matching
 * Handles snake_case, camelCase, kebab-case, dot.notation
 * @param key - The key to normalize
 * @returns Normalized key parts
 */
export function normalizeKey(key: string): string[] {
  // Split by common delimiters and camelCase
  const parts: string[] = [];
  
  // First split by dots, underscores, and hyphens
  const segments = key.split(/[._-]/);
  
  for (const segment of segments) {
    // Split camelCase and PascalCase
    const camelParts = segment
      .replace(/([a-z])([A-Z])/g, '$1 $2') // camelCase
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // PascalCase
      .split(' ')
      .filter(Boolean);
    
    parts.push(...camelParts);
  }
  
  // Convert all parts to lowercase and filter empty strings
  return parts
    .map(part => part.toLowerCase())
    .filter(Boolean);
}

/**
 * Calculate match score between two normalized keys
 * @param key1Parts - First key parts
 * @param key2Parts - Second key parts
 * @returns Score from 0 to 1
 */
export function calculateMatchScore(key1Parts: string[], key2Parts: string[]): number {
  if (key1Parts.length === 0 || key2Parts.length === 0) {
    return 0;
  }
  
  // Exact match
  if (key1Parts.length === key2Parts.length && 
      key1Parts.every((part, i) => part === key2Parts[i])) {
    return 1.0;
  }
  
  // Calculate overlap score
  let matches = 0;
  const maxLength = Math.max(key1Parts.length, key2Parts.length);
  const minLength = Math.min(key1Parts.length, key2Parts.length);
  
  // Check for matching parts in order
  for (let i = 0; i < minLength; i++) {
    if (key1Parts[i] === key2Parts[i]) {
      matches++;
    }
  }
  
  // Check for matching parts regardless of order
  const key1Set = new Set(key1Parts);
  const key2Set = new Set(key2Parts);
  let setMatches = 0;
  
  for (const part of key1Set) {
    if (key2Set.has(part)) {
      setMatches++;
    }
  }
  
  // Weighted score: order matters more than just presence
  const orderScore = matches / maxLength;
  const presenceScore = setMatches / Math.max(key1Set.size, key2Set.size);
  
  // Return weighted average (order is more important)
  return orderScore * 0.7 + presenceScore * 0.3;
}

/**
 * Check if a flat key matches a nested path
 * @param flatKey - The flat key to match (e.g., "database_pool_max")
 * @param nestedPath - The nested path parts (e.g., ["database", "pool", "max"])
 * @returns True if they match
 */
export function matchesNestedPath(flatKey: string, nestedPath: string[]): boolean {
  const flatKeyParts = normalizeKey(flatKey);
  const normalizedPath = nestedPath.map(p => p.toLowerCase());
  
  // For exact matching, check if the full normalized key matches the path
  if (flatKeyParts.length === normalizedPath.length &&
      flatKeyParts.every((part, i) => part === normalizedPath[i])) {
    return true;
  }
  
  // For partial matching, check if flat key is a subset of the path
  // But only if all parts match in sequence
  if (flatKeyParts.length < normalizedPath.length) {
    // Check if flatKey matches beginning or end of path
    const matchesStart = flatKeyParts.every((part, i) => part === normalizedPath[i]);
    const matchesEnd = flatKeyParts.every((part, i) => 
      part === normalizedPath[normalizedPath.length - flatKeyParts.length + i]
    );
    return matchesStart || matchesEnd;
  }
  
  // Check if path is subset of flatKey
  if (normalizedPath.length < flatKeyParts.length) {
    const pathMatchesStart = normalizedPath.every((part, i) => part === flatKeyParts[i]);
    const pathMatchesEnd = normalizedPath.every((part, i) => 
      part === flatKeyParts[flatKeyParts.length - normalizedPath.length + i]
    );
    return pathMatchesStart || pathMatchesEnd;
  }
  
  return false;
}

/**
 * Convert a value from one config format to another
 * @param value - The value to convert
 * @param sourceType - Source file type
 * @param targetType - Target file type
 * @param key - The configuration key (for context)
 * @returns Conversion result
 */
export function convertValue(
  value: any,
  sourceType: ConfigFile['type'],
  targetType: ConfigFile['type'],
  key: string
): ConversionResult {
  // First, handle primitives (numbers, booleans, strings)
  if (typeof value === 'number' || typeof value === 'boolean') {
    // Simple conversion to string for any format
    return {
      success: true,
      value: String(value)
    };
  }
  
  // Check for environment variables in strings
  if (typeof value === 'string' && containsEnvVariables(value)) {
    return {
      success: true,
      value: value,
      warning: 'Value contains environment variables'
    };
  }
  
  // Handle regular strings
  if (typeof value === 'string') {
    return {
      success: true,
      value: value
    };
  }
  
  // Handle complex objects
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const jsonString = JSON.stringify(value);
    if (targetType === 'env') {
      // For env files, complex objects need user choice
      return {
        success: false,
        value: jsonString,
        requiresUserChoice: {
          type: 'complex_object',
          options: [
            {
              label: 'Use as JSON string',
              value: jsonString,
              isDefault: true
            }
          ],
          originalValue: value,
          targetFormat: targetType
        }
      };
    }
    return {
      success: true,
      value: jsonString
    };
  }
  
  // Handle arrays
  if (Array.isArray(value)) {
    if (targetType === 'env') {
      // Convert array to comma-separated string for env files
      return {
        success: true,
        value: value.join(',')
      };
    }
    return {
      success: true,
      value: JSON.stringify(value)
    };
  }
  
  // Handle numbers and booleans
  if (typeof value === 'number' || typeof value === 'boolean') {
    // Convert to string for env files
    return {
      success: true,
      value: String(value)
    };
  }
  
  // Handle strings
  if (typeof value === 'string') {
    return {
      success: true,
      value: value
    };
  }
  
  // Handle null/undefined
  if (value === null || value === undefined) {
    return {
      success: true,
      value: ''
    };
  }
  
  // Fallback - convert to string
  return {
    success: true,
    value: String(value)
  };
}

/**
 * Parse a complex value (object/array) from a string
 * @param value - String value that might contain JSON/YAML
 * @returns Parsed value or original string
 */
export function parseComplexValue(value: string): any {
  // Try to parse as JSON
  try {
    return JSON.parse(value);
  } catch {
    // If not JSON, return original string
    return value;
  }
}

/**
 * Format a value for a specific config file type
 * @param value - The value to format
 * @param targetType - Target file type
 * @param key - The configuration key
 * @returns Formatted string
 */
export function formatValueForType(
  value: any,
  targetType: ConfigFile['type'],
  key: string
): string {
  if (targetType === 'env') {
    // Handle arrays for env files
    if (Array.isArray(value)) {
      return value.join(',');
    }
    
    // Handle strings that need quotes
    if (typeof value === 'string') {
      // Check if string contains special characters that need quoting
      if (value.includes('"')) {
        return `"${value.replace(/"/g, '\\"')}"`;
      }
      return value;
    }
    
    // Everything else becomes a string
    return String(value);
  }
  
  // For JSON/YAML/TOML
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * Check if a value contains environment variable references
 * @param value - The value to check
 * @returns True if contains ${VAR} or $VAR patterns
 */
export function containsEnvVariables(value: string): boolean {
  // Check for ${VAR} or $VAR patterns, but not escaped ones
  const envVarPattern = /(?<!\\)\$\{?[A-Z_][A-Z0-9_]*\}?/;
  return envVarPattern.test(value);
}

/**
 * Extract environment variable names from a value
 * @param value - The value containing variables
 * @returns Array of variable names
 */
export function extractEnvVariables(value: string): string[] {
  const variables = new Set<string>();
  
  // Match ${VAR} format
  const bracketMatches = value.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g);
  for (const match of bracketMatches) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  
  // Match $VAR format (but not if followed by {)
  const simpleMatches = value.matchAll(/\$([A-Z_][A-Z0-9_]*)(?!\{)/g);
  for (const match of simpleMatches) {
    if (match[1]) {
      variables.add(match[1]);
    }
  }
  
  return Array.from(variables);
}

/**
 * Apply a found value to the target configuration file
 * @param targetFile - The file to update
 * @param targetKey - The key to update
 * @param foundValue - The value to apply
 * @param userChoice - Optional user choice for complex conversions
 * @returns Success status and any error message
 */
export async function applyFoundValue(
  targetFile: ConfigFile,
  targetKey: string,
  foundValue: FoundValue,
  userChoice?: ConversionOption
): Promise<{ success: boolean; error?: string }> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    // Read the target file
    const content = await fs.readFile(targetFile.path, 'utf-8');
    
    // Convert the value to the target format
    const conversionResult = convertValue(
      foundValue.value,
      foundValue.file.type,
      targetFile.type,
      targetKey
    );
    
    if (!conversionResult.success && !userChoice) {
      return { 
        success: false, 
        error: 'Value conversion requires user choice' 
      };
    }
    
    const valueToUse = userChoice?.value || conversionResult.value;
    
    // Update the file content based on file type
    let updatedContent: string;
    
    switch (targetFile.type) {
      case 'env':
        updatedContent = updateEnvFile(content, targetKey, valueToUse);
        break;
      case 'json':
        updatedContent = updateJsonFile(content, targetKey, valueToUse);
        break;
      case 'yaml':
        updatedContent = updateYamlFile(content, targetKey, valueToUse);
        break;
      case 'toml':
        updatedContent = updateTomlFile(content, targetKey, valueToUse);
        break;
      case 'ini':
        updatedContent = updateIniFile(content, targetKey, valueToUse);
        break;
      default:
        return { success: false, error: 'Unsupported file type' };
    }
    
    // Write the updated content back to the file
    await fs.writeFile(targetFile.path, updatedContent, 'utf-8');
    
    return { success: true };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Helper functions for updating different file types
function updateEnvFile(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  const keyPattern = new RegExp(`^${escapeRegExp(key)}=`);
  
  let found = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && keyPattern.test(line)) {
      // Preserve any inline comment
      const commentMatch = line.match(/(#.*)$/);
      lines[i] = `${key}=${value}${commentMatch ? ' ' + commentMatch[1] : ''}`;
      found = true;
      break;
    }
  }
  
  if (!found) {
    // Add the new key-value pair
    lines.push(`${key}=${value}`);
  }
  
  return lines.join('\n');
}

function updateJsonFile(content: string, key: string, value: string): string {
  try {
    const json = JSON.parse(content);
    
    // Handle nested keys (e.g., "database.host")
    const keyParts = key.split('.');
    let current = json;
    
    for (let i = 0; i < keyParts.length - 1; i++) {
      const part = keyParts[i];
      if (part && !current[part]) {
        current[part] = {};
      }
      if (part) {
        current = current[part];
      }
    }
    
    // Parse the value if it's JSON
    const lastKey = keyParts[keyParts.length - 1];
    if (lastKey) {
      try {
        current[lastKey] = JSON.parse(value);
      } catch {
        // If not valid JSON, use as string
        current[lastKey] = value;
      }
    }
    
    return JSON.stringify(json, null, 2);
  } catch {
    return content; // Return original if parsing fails
  }
}

function updateYamlFile(content: string, key: string, value: string): string {
  // For YAML, we need to be careful about indentation
  // This is a simplified implementation - in production, use a YAML parser
  const lines = content.split('\n');
  const keyParts = key.split('.');
  const lastKeyPart = keyParts[keyParts.length - 1];
  
  if (!lastKeyPart) return content;
  
  // Find the line with the key
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    
    const trimmed = line.trim();
    
    // Simple case: top-level key
    if (trimmed.startsWith(`${lastKeyPart}:`)) {
      const indent = line.match(/^(\s*)/)?.[1] || '';
      
      // Parse the value if needed
      let formattedValue = value;
      try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'object') {
          // Convert object to YAML format
          formattedValue = JSON.stringify(parsed);
        }
      } catch {
        // Use value as-is
      }
      
      // Preserve inline comments
      const commentMatch = line.match(/(#.*)$/);
      lines[i] = `${indent}${lastKeyPart}: ${formattedValue}${commentMatch ? ' ' + commentMatch[1] : ''}`;
      return lines.join('\n');
    }
  }
  
  // If not found, add at the end
  lines.push(`${key}: ${value}`);
  return lines.join('\n');
}

function updateTomlFile(content: string, key: string, value: string): string {
  // Similar to INI but with different syntax
  const lines = content.split('\n');
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && keyPattern.test(line)) {
      // Preserve comments
      const commentMatch = line.match(/(#.*)$/);
      lines[i] = `${key} = ${value}${commentMatch ? ' ' + commentMatch[1] : ''}`;
      return lines.join('\n');
    }
  }
  
  lines.push(`${key} = ${value}`);
  return lines.join('\n');
}

function updateIniFile(content: string, key: string, value: string): string {
  const lines = content.split('\n');
  const keyPattern = new RegExp(`^${escapeRegExp(key)}\\s*=`);
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && keyPattern.test(line)) {
      // Preserve comments
      const commentMatch = line.match(/(;.*)$/);
      lines[i] = `${key} = ${value}${commentMatch ? ' ' + commentMatch[1] : ''}`;
      return lines.join('\n');
    }
  }
  
  lines.push(`${key} = ${value}`);
  return lines.join('\n');
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

