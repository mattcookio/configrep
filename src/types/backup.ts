export interface BackupManifest {
  version: "1.0.0";
  created: string;
  lastModified: string;
  encrypted?: boolean;
  files: BackupFileRecord[];
}

export interface BackupFileRecord {
  id: string;
  originalPath: string;
  fileName: string;
  fileType: 'env' | 'json' | 'yaml' | 'toml' | 'ini' | 'unknown';
  versions: BackupVersion[];
}

export interface BackupVersion {
  versionNumber: number;
  timestamp: string;
  hash: string;
  content?: any;
  changes?: VersionDelta[];
}

export interface VersionDelta {
  op: 'add' | 'remove' | 'replace';
  path: string;
  value?: any;
  oldValue?: any;
}

export interface EncryptedBackup {
  encrypted: true;
  algorithm: 'aes-256-gcm';
  salt: string;
  iv: string;
  authTag: string;
  iterations: 210000;
  data: string;
}

export interface BackupOptions {
  directory?: string;
  ignore?: string[];
  depth?: number;
  output?: string;
  password?: string;
  dryRun?: boolean;
}

export interface BackupResult {
  success: boolean;
  backupPath: string;
  filesProcessed: number;
  changesDetected: number;
  encrypted: boolean;
  error?: string;
}