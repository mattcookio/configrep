import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from 'crypto';
import type { EncryptedBackup, BackupManifest } from '../types/backup';

const ALGORITHM = 'aes-256-gcm';
const ITERATIONS = 210000;
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const KEY_LENGTH = 32;

export function encryptData(data: BackupManifest, password: string): EncryptedBackup {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  const key = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, 'sha256');
  
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from('configrep-backup'));
  
  const dataStr = JSON.stringify(data);
  let encrypted = cipher.update(dataStr, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted: true,
    algorithm: ALGORITHM,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    iterations: ITERATIONS,
    data: encrypted
  };
}

export function decryptData(encryptedBackup: EncryptedBackup, password: string): BackupManifest {
  if (!encryptedBackup.encrypted || encryptedBackup.algorithm !== ALGORITHM) {
    throw new Error('Invalid encrypted backup format');
  }
  
  const salt = Buffer.from(encryptedBackup.salt, 'base64');
  const iv = Buffer.from(encryptedBackup.iv, 'base64');
  const authTag = Buffer.from(encryptedBackup.authTag, 'base64');
  
  const key = pbkdf2Sync(password, salt, encryptedBackup.iterations, KEY_LENGTH, 'sha256');
  
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from('configrep-backup'));
  decipher.setAuthTag(authTag);
  
  try {
    let decrypted = decipher.update(encryptedBackup.data, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted) as BackupManifest;
  } catch (error) {
    if (error instanceof Error && (
      error.message.includes('bad decrypt') || 
      error.message.includes('unable to authenticate data') ||
      error.message.includes('Unsupported state')
    )) {
      throw new Error('Invalid password or corrupted backup');
    }
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function validatePassword(password: string): { valid: boolean; error?: string } {
  if (!password || password.length === 0) {
    return { valid: false, error: 'Password cannot be empty' };
  }
  
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long' };
  }
  
  return { valid: true };
}

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}