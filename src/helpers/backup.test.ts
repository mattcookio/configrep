import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { 
  createBackup, 
  loadBackup, 
  saveBackup, 
  hashContent, 
  reconstructAtVersion,
  restoreFromBackup
} from './backup';
import type { BackupManifest, BackupFileRecord } from '../types/backup';

describe('backup', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'configrep-test-'));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('hashContent', () => {
    it('should generate consistent hashes for same content', () => {
      const content = { key: 'value', nested: { prop: 123 } };
      const hash1 = hashContent(content);
      const hash2 = hashContent(content);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different hashes for different content', () => {
      const content1 = { key: 'value1' };
      const content2 = { key: 'value2' };
      
      const hash1 = hashContent(content1);
      const hash2 = hashContent(content2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle string content', () => {
      const hash1 = hashContent('test string');
      const hash2 = hashContent('test string');
      const hash3 = hashContent('different string');
      
      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(hash3);
    });
  });

  describe('loadBackup and saveBackup', () => {
    it('should save and load backup manifest', async () => {
      const manifest: BackupManifest = {
        version: "1.0.0",
        created: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z',
        files: []
      };

      const backupPath = join(testDir, 'test-backup.json');
      await saveBackup(manifest, backupPath);
      
      const loaded = await loadBackup(backupPath);
      expect(loaded).toEqual(manifest);
    });

    it('should return null for non-existent backup', async () => {
      const backupPath = join(testDir, 'non-existent.json');
      const loaded = await loadBackup(backupPath);
      expect(loaded).toBeNull();
    });

    it('should throw error for encrypted backup', async () => {
      const encryptedData = { encrypted: true, data: 'encrypted-content' };
      const backupPath = join(testDir, 'encrypted-backup.json');
      await writeFile(backupPath, JSON.stringify(encryptedData), 'utf-8');
      
      await expect(loadBackup(backupPath)).rejects.toThrow('Backup is encrypted');
    });
  });

  describe('reconstructAtVersion', () => {
    it('should return content for version 1', async () => {
      const fileRecord: BackupFileRecord = {
        id: 'test-id',
        originalPath: 'test.json',
        fileName: 'test.json',
        fileType: 'json',
        versions: [{
          versionNumber: 1,
          timestamp: '2024-01-01T00:00:00.000Z',
          hash: 'hash1',
          content: { key: 'value1' }
        }]
      };

      const result = await reconstructAtVersion(fileRecord, 1);
      expect(result).toEqual({ key: 'value1' });
    });

    it('should apply patches for later versions', async () => {
      const fileRecord: BackupFileRecord = {
        id: 'test-id',
        originalPath: 'test.json',
        fileName: 'test.json',
        fileType: 'json',
        versions: [
          {
            versionNumber: 1,
            timestamp: '2024-01-01T00:00:00.000Z',
            hash: 'hash1',
            content: { key: 'value1', other: 'unchanged' }
          },
          {
            versionNumber: 2,
            timestamp: '2024-01-01T01:00:00.000Z',
            hash: 'hash2',
            changes: [
              { op: 'replace', path: '/key', value: 'value2' },
              { op: 'add', path: '/newKey', value: 'newValue' }
            ]
          }
        ]
      };

      const result = await reconstructAtVersion(fileRecord, 2);
      expect(result).toEqual({ 
        key: 'value2', 
        other: 'unchanged', 
        newKey: 'newValue' 
      });
    });

    it('should throw error for invalid version', async () => {
      const fileRecord: BackupFileRecord = {
        id: 'test-id',
        originalPath: 'test.json',
        fileName: 'test.json',
        fileType: 'json',
        versions: [{
          versionNumber: 1,
          timestamp: '2024-01-01T00:00:00.000Z',
          hash: 'hash1',
          content: { key: 'value1' }
        }]
      };

      await expect(reconstructAtVersion(fileRecord, 0)).rejects.toThrow('Invalid version 0');
      await expect(reconstructAtVersion(fileRecord, 2)).rejects.toThrow('Invalid version 2');
    });

    it('should throw error when version not found', async () => {
      const fileRecord: BackupFileRecord = {
        id: 'test-id',
        originalPath: 'test.json',
        fileName: 'test.json',
        fileType: 'json',
        versions: []
      };

      await expect(reconstructAtVersion(fileRecord, 1)).rejects.toThrow('Invalid version 1');
    });
  });

  describe('createBackup', () => {
    beforeEach(async () => {
      // Create test config files
      await writeFile(join(testDir, '.env'), 'API_KEY=secret123\nDEBUG=true', 'utf-8');
      await writeFile(join(testDir, 'config.json'), JSON.stringify({
        database: { host: 'localhost', port: 5432 },
        app: { name: 'test-app' }
      }, null, 2), 'utf-8');
    });

    it('should create initial backup', async () => {
      const result = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(2);
      expect(result.changesDetected).toBe(2);
      expect(result.encrypted).toBe(false);

      const backup = await loadBackup(join(testDir, 'backup.json'));
      expect(backup).not.toBeNull();
      expect(backup!.files).toHaveLength(2);
      
      const envFile = backup!.files.find(f => f.fileName === '.env');
      const jsonFile = backup!.files.find(f => f.fileName === 'config.json');
      
      expect(envFile).toBeDefined();
      expect(jsonFile).toBeDefined();
      expect(envFile!.versions).toHaveLength(1);
      expect(jsonFile!.versions).toHaveLength(1);
    });

    it('should detect changes in subsequent backups', async () => {
      // Create initial backup
      const result1 = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });
      expect(result1.changesDetected).toBe(2); // Initial backup should detect 2 files

      // Modify a file
      await writeFile(join(testDir, '.env'), 'API_KEY=newsecret456\nDEBUG=false', 'utf-8');

      // Create second backup
      const result = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });

      expect(result.success).toBe(true);
      expect(result.changesDetected).toBe(1);

      const backup = await loadBackup(join(testDir, 'backup.json'));
      expect(backup).not.toBeNull();
      const envFile = backup!.files.find(f => f.fileName === '.env');
      
      expect(envFile!.versions).toHaveLength(2);
      expect(envFile!.versions[1].changes).toBeDefined();
    });

    it('should not create new versions for unchanged files', async () => {
      // Create initial backup
      const result1 = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });
      expect(result1.changesDetected).toBe(2); // Initial backup

      // Create second backup without changes
      const result = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });

      expect(result.success).toBe(true);
      expect(result.changesDetected).toBe(0);

      const backup = await loadBackup(join(testDir, 'backup.json'));
      expect(backup).not.toBeNull();
      backup!.files.forEach(file => {
        expect(file.versions).toHaveLength(1);
      });
    });

    it('should handle dry run mode', async () => {
      const result = await createBackup({
        directory: testDir,
        output: 'backup.json',
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(2);
      expect(result.changesDetected).toBe(2);

      // Backup file should not exist
      const backup = await loadBackup(join(testDir, 'backup.json'));
      expect(backup).toBeNull();
    });

    it('should handle empty directory', async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), 'empty-'));
      
      try {
        const result = await createBackup({
          directory: emptyDir,
          output: 'backup.json'
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('No config files found');
      } finally {
        await rm(emptyDir, { recursive: true, force: true });
      }
    });

    it('should respect ignore patterns', async () => {
      await writeFile(join(testDir, 'ignored.json'), '{"ignored": true}', 'utf-8');
      
      const result = await createBackup({
        directory: testDir,
        output: 'backup.json',
        ignore: ['ignored.json']
      });

      expect(result.success).toBe(true);
      expect(result.filesProcessed).toBe(2); // Should still be 2, not 3

      const backup = await loadBackup(join(testDir, 'backup.json'));
      expect(backup).not.toBeNull();
      const ignoredFile = backup!.files.find(f => f.fileName === 'ignored.json');
      expect(ignoredFile).toBeUndefined();
    });
  });

  describe('restoreFromBackup', () => {
    let backupPath: string;

    beforeEach(async () => {
      backupPath = join(testDir, 'backup.json');
      
      // Create a backup with test data
      const manifest: BackupManifest = {
        version: "1.0.0",
        created: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z',
        files: [{
          id: 'test-id',
          originalPath: 'config.json',
          fileName: 'config.json',
          fileType: 'json',
          versions: [
            {
              versionNumber: 1,
              timestamp: '2024-01-01T00:00:00.000Z',
              hash: 'hash1',
              content: { database: { host: 'localhost' }, app: { name: 'test' } }
            },
            {
              versionNumber: 2,
              timestamp: '2024-01-01T01:00:00.000Z',
              hash: 'hash2',
              changes: [
                { op: 'replace', path: '/database/host', value: 'remote-host' },
                { op: 'add', path: '/database/port', value: 5432 }
              ]
            }
          ]
        }]
      };

      await saveBackup(manifest, backupPath);
    });

    it('should restore file at specific version', async () => {
      const outputPath = join(testDir, 'restored.json');
      
      const result = await restoreFromBackup(backupPath, 'config.json', 2, outputPath);
      
      expect(result.success).toBe(true);
      expect(result.restoredPath).toBe(outputPath);

      const content = await readFile(outputPath, 'utf-8');
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual({
        database: { host: 'remote-host', port: 5432 },
        app: { name: 'test' }
      });
    });

    it('should restore to original path if no output specified', async () => {
      const result = await restoreFromBackup(backupPath, 'config.json', 1);
      
      expect(result.success).toBe(true);
      expect(result.restoredPath).toContain('config.json');

      const content = await readFile(result.restoredPath!, 'utf-8');
      const parsed = JSON.parse(content);
      
      expect(parsed).toEqual({
        database: { host: 'localhost' },
        app: { name: 'test' }
      });
    });

    it('should handle env file format', async () => {
      const envManifest: BackupManifest = {
        version: "1.0.0",
        created: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z',
        files: [{
          id: 'env-id',
          originalPath: '.env',
          fileName: '.env',
          fileType: 'env',
          versions: [{
            versionNumber: 1,
            timestamp: '2024-01-01T00:00:00.000Z',
            hash: 'hash1',
            content: { API_KEY: 'secret123', DEBUG: 'true' }
          }]
        }]
      };

      const envBackupPath = join(testDir, 'env-backup.json');
      await saveBackup(envManifest, envBackupPath);

      const result = await restoreFromBackup(envBackupPath, '.env', 1);
      
      expect(result.success).toBe(true);

      const content = await readFile(result.restoredPath!, 'utf-8');
      expect(content).toBe('API_KEY=secret123\nDEBUG=true');
    });

    it('should return error for non-existent backup', async () => {
      const result = await restoreFromBackup('non-existent.json', 'config.json', 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Backup file not found');
    });

    it('should return error for non-existent file', async () => {
      const result = await restoreFromBackup(backupPath, 'non-existent.json', 1);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found in backup');
    });

    it('should find file by partial path match', async () => {
      const result = await restoreFromBackup(backupPath, 'config.json', 1);
      
      expect(result.success).toBe(true);
    });
  });

  describe('integration tests', () => {
    it('should handle complete backup and restore workflow', async () => {
      // Create test files
      await writeFile(join(testDir, '.env'), 'API_KEY=original\nDEBUG=true', 'utf-8');
      await writeFile(join(testDir, 'config.json'), JSON.stringify({
        database: { host: 'localhost', port: 5432 }
      }), 'utf-8');

      // Create initial backup
      const backup1 = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });
      expect(backup1.success).toBe(true);

      // Modify files
      await writeFile(join(testDir, '.env'), 'API_KEY=modified\nDEBUG=false\nNEW_VAR=added', 'utf-8');
      await writeFile(join(testDir, 'config.json'), JSON.stringify({
        database: { host: 'remote-host', port: 3306, ssl: true }
      }), 'utf-8');

      // Create second backup
      const backup2 = await createBackup({
        directory: testDir,
        output: 'backup.json'
      });
      expect(backup2.success).toBe(true);
      expect(backup2.changesDetected).toBe(2); // Both files changed

      // Restore to version 1
      const restore1 = await restoreFromBackup(
        join(testDir, 'backup.json'),
        '.env',
        1,
        join(testDir, 'restored-env-v1')
      );
      expect(restore1.success).toBe(true);

      const restoredContent = await readFile(join(testDir, 'restored-env-v1'), 'utf-8');
      expect(restoredContent).toBe('API_KEY=original\nDEBUG=true');

      // Restore to version 2
      const restore2 = await restoreFromBackup(
        join(testDir, 'backup.json'),
        '.env',
        2,
        join(testDir, 'restored-env-v2')
      );
      expect(restore2.success).toBe(true);

      const restoredContent2 = await readFile(join(testDir, 'restored-env-v2'), 'utf-8');
      expect(restoredContent2).toBe('API_KEY=modified\nDEBUG=false\nNEW_VAR=added');
    });
  });
});