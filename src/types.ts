export interface ConfigFile {
  path: string;
  name: string;
  relativePath: string;
  type: 'env' | 'json' | 'yaml' | 'toml' | 'ini' | 'unknown';
  size: number;
  depth: number;
}

export interface ConfigEntry {
  key: string;
  value: string;
  file: string;
  rawValue?: any; // Store the original parsed value for JSON objects/arrays
}

export interface ParsedConfig {
  file: ConfigFile;
  entries: ConfigEntry[];
  error?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  isFile: boolean;
  isConfigEntry?: boolean;
  children: TreeNode[];
  configFile?: ConfigFile;
  configEntry?: ConfigEntry;
}

export interface ConfiGREPConfig {
  directory?: string;
  ignore?: string[];
  depth?: number;
  defaultCommand?: 'list' | 'show' | 'interactive';
  fileTypes?: {
    env?: boolean;
    json?: boolean;
    yaml?: boolean;
    toml?: boolean;
    ini?: boolean;
  };
}

export * from './types/backup';
