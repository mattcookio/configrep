import { describe, it, expect } from 'bun:test';
import { encryptData, decryptData, validatePassword, hashPassword } from './crypto';
import type { BackupManifest } from '../types/backup';

describe('crypto', () => {
  const testManifest: BackupManifest = {
    version: "1.0.0",
    created: '2024-01-01T00:00:00.000Z',
    lastModified: '2024-01-01T00:00:00.000Z',
    files: [{
      id: 'test-id',
      originalPath: 'test.json',
      fileName: 'test.json',
      fileType: 'json',
      versions: [{
        versionNumber: 1,
        timestamp: '2024-01-01T00:00:00.000Z',
        hash: 'test-hash',
        content: { key: 'value', nested: { prop: 123 } }
      }]
    }]
  };

  describe('encryptData', () => {
    it('should encrypt backup manifest with password', () => {
      const password = 'test-password-123';
      
      const encrypted = encryptData(testManifest, password);
      
      expect(encrypted.encrypted).toBe(true);
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      expect(encrypted.iterations).toBe(210000);
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.data).toBeDefined();
      
      // Verify base64 encoding
      expect(() => Buffer.from(encrypted.salt, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.iv, 'base64')).not.toThrow();
      expect(() => Buffer.from(encrypted.authTag, 'base64')).not.toThrow();
    });

    it('should generate unique salt and IV for each encryption', () => {
      const password = 'test-password-123';
      
      const encrypted1 = encryptData(testManifest, password);
      const encrypted2 = encryptData(testManifest, password);
      
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.data).not.toBe(encrypted2.data);
    });

    it('should handle large data structures', () => {
      const largeManifest: BackupManifest = {
        ...testManifest,
        files: Array.from({ length: 100 }, (_, i) => ({
          id: `test-id-${i}`,
          originalPath: `test-${i}.json`,
          fileName: `test-${i}.json`,
          fileType: 'json' as const,
          versions: [{
            versionNumber: 1,
            timestamp: '2024-01-01T00:00:00.000Z',
            hash: `test-hash-${i}`,
            content: { 
              key: `value-${i}`, 
              data: Array.from({ length: 50 }, (_, j) => ({ prop: j, value: `data-${i}-${j}` }))
            }
          }]
        }))
      };
      
      const password = 'test-password-123';
      
      expect(() => encryptData(largeManifest, password)).not.toThrow();
    });
  });

  describe('decryptData', () => {
    it('should decrypt encrypted backup with correct password', () => {
      const password = 'test-password-123';
      
      const encrypted = encryptData(testManifest, password);
      const decrypted = decryptData(encrypted, password);
      
      expect(decrypted).toEqual(testManifest);
    });

    it('should throw error with incorrect password', () => {
      const password = 'test-password-123';
      const wrongPassword = 'wrong-password';
      
      const encrypted = encryptData(testManifest, password);
      
      expect(() => decryptData(encrypted, wrongPassword)).toThrow('Invalid password or corrupted backup');
    });

    it('should throw error for invalid encrypted backup format', () => {
      const invalidBackup = {
        encrypted: false,
        algorithm: 'aes-256-gcm',
        salt: 'invalid',
        iv: 'invalid',
        authTag: 'invalid',
        iterations: 210000,
        data: 'invalid'
      } as any;
      
      expect(() => decryptData(invalidBackup, 'password')).toThrow('Invalid encrypted backup format');
    });

    it('should throw error for wrong algorithm', () => {
      const password = 'test-password-123';
      const encrypted = encryptData(testManifest, password);
      
      const tamperedBackup = {
        ...encrypted,
        algorithm: 'aes-128-gcm' as any
      };
      
      expect(() => decryptData(tamperedBackup, password)).toThrow('Invalid encrypted backup format');
    });

    it('should detect tampered data', () => {
      const password = 'test-password-123';
      const encrypted = encryptData(testManifest, password);
      
      const tamperedBackup = {
        ...encrypted,
        data: encrypted.data.slice(0, -10) + 'tampered123'
      };
      
      expect(() => decryptData(tamperedBackup, password)).toThrow();
    });

    it('should detect tampered auth tag', () => {
      const password = 'test-password-123';
      const encrypted = encryptData(testManifest, password);
      
      const tamperedBackup = {
        ...encrypted,
        authTag: Buffer.from('tampered-auth-tag').toString('base64')
      };
      
      expect(() => decryptData(tamperedBackup, password)).toThrow();
    });

    it('should handle complex nested structures', () => {
      const complexManifest: BackupManifest = {
        version: "1.0.0",
        created: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z',
        files: [{
          id: 'complex-id',
          originalPath: 'complex.json',
          fileName: 'complex.json',
          fileType: 'json',
          versions: [
            {
              versionNumber: 1,
              timestamp: '2024-01-01T00:00:00.000Z',
              hash: 'hash1',
              content: {
                database: {
                  connections: [
                    { host: 'localhost', port: 5432, ssl: true },
                    { host: 'remote', port: 3306, ssl: false }
                  ],
                  config: {
                    timeout: 30000,
                    retries: 3,
                    pool: { min: 2, max: 10 }
                  }
                },
                features: {
                  auth: { enabled: true, providers: ['oauth', 'saml'] },
                  cache: { enabled: false, ttl: 3600 }
                }
              }
            },
            {
              versionNumber: 2,
              timestamp: '2024-01-01T01:00:00.000Z',
              hash: 'hash2',
              changes: [
                { op: 'replace', path: '/database/config/timeout', value: 60000 },
                { op: 'add', path: '/features/logging', value: { level: 'info', file: 'app.log' } }
              ]
            }
          ]
        }]
      };
      
      const password = 'complex-password-456';
      
      const encrypted = encryptData(complexManifest, password);
      const decrypted = decryptData(encrypted, password);
      
      expect(decrypted).toEqual(complexManifest);
    });
  });

  describe('validatePassword', () => {
    it('should accept valid passwords', () => {
      const validPasswords = [
        'password123',
        'my-secure-password',
        'P@ssw0rd!',
        'verylongpasswordthatisverysecure',
        '12345678'
      ];
      
      validPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject empty passwords', () => {
      const result = validatePassword('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Password cannot be empty');
    });

    it('should reject short passwords', () => {
      const shortPasswords = ['1', '12', '123', '1234567'];
      
      shortPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Password must be at least 8 characters long');
      });
    });

    it('should handle null/undefined passwords', () => {
      const result1 = validatePassword(null as any);
      const result2 = validatePassword(undefined as any);
      
      expect(result1.valid).toBe(false);
      expect(result1.error).toBe('Password cannot be empty');
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('Password cannot be empty');
    });
  });

  describe('hashPassword', () => {
    it('should generate consistent hashes for same password', () => {
      const password = 'test-password-123';
      
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different hashes for different passwords', () => {
      const password1 = 'password1';
      const password2 = 'password2';
      
      const hash1 = hashPassword(password1);
      const hash2 = hashPassword(password2);
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle special characters', () => {
      const password = 'p@ssw0rd!#$%^&*()';
      
      expect(() => hashPassword(password)).not.toThrow();
      expect(hashPassword(password)).toHaveLength(64);
    });

    it('should handle unicode characters', () => {
      const password = 'пароль123🔒';
      
      expect(() => hashPassword(password)).not.toThrow();
      expect(hashPassword(password)).toHaveLength(64);
    });
  });

  describe('integration tests', () => {
    it('should encrypt and decrypt multiple times consistently', () => {
      const password = 'integration-test-password';
      
      let current = testManifest;
      
      for (let i = 0; i < 5; i++) {
        const encrypted = encryptData(current, password);
        const decrypted = decryptData(encrypted, password);
        
        expect(decrypted).toEqual(current);
        current = decrypted;
      }
    });

    it('should handle empty manifest', () => {
      const emptyManifest: BackupManifest = {
        version: "1.0.0",
        created: '2024-01-01T00:00:00.000Z',
        lastModified: '2024-01-01T00:00:00.000Z',
        files: []
      };
      
      const password = 'empty-test-password';
      
      const encrypted = encryptData(emptyManifest, password);
      const decrypted = decryptData(encrypted, password);
      
      expect(decrypted).toEqual(emptyManifest);
    });

    it('should work with different password lengths', () => {
      const passwords = [
        '12345678',
        'medium-length-password',
        'very-very-very-long-password-that-exceeds-normal-length-expectations'
      ];
      
      passwords.forEach(password => {
        const encrypted = encryptData(testManifest, password);
        const decrypted = decryptData(encrypted, password);
        
        expect(decrypted).toEqual(testManifest);
      });
    });
  });
});