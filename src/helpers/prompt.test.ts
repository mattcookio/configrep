import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test';
import { promptConfirmation, promptChoice, getPasswordFromEnv } from './prompt';

// Mock inquirer for testing
const mockInquirer = {
  prompt: mock(() => Promise.resolve({}))
};

// Mock the inquirer module
mock.module('inquirer', () => ({
  default: mockInquirer
}));

describe('prompt', () => {
  beforeEach(() => {
    mockInquirer.prompt.mockClear();
  });

  describe('promptConfirmation', () => {
    it('should return true when user confirms', async () => {
      mockInquirer.prompt.mockResolvedValue({ confirmed: true });
      
      const result = await promptConfirmation('Are you sure?');
      
      expect(result).toBe(true);
      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure?',
          default: false
        }
      ]);
    });

    it('should return false when user declines', async () => {
      mockInquirer.prompt.mockResolvedValue({ confirmed: false });
      
      const result = await promptConfirmation('Are you sure?');
      
      expect(result).toBe(false);
    });

    it('should use custom default value', async () => {
      mockInquirer.prompt.mockResolvedValue({ confirmed: true });
      
      await promptConfirmation('Are you sure?', true);
      
      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'confirm',
          name: 'confirmed',
          message: 'Are you sure?',
          default: true
        }
      ]);
    });
  });

  describe('promptChoice', () => {
    it('should return selected choice', async () => {
      mockInquirer.prompt.mockResolvedValue({ choice: 'option2' });
      
      const choices = [
        { name: 'Option 1', value: 'option1' },
        { name: 'Option 2', value: 'option2' },
        { name: 'Option 3', value: 'option3' }
      ];
      
      const result = await promptChoice('Select an option:', choices);
      
      expect(result).toBe('option2');
      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'list',
          name: 'choice',
          message: 'Select an option:',
          choices,
          default: undefined
        }
      ]);
    });

    it('should use default value', async () => {
      mockInquirer.prompt.mockResolvedValue({ choice: 'option1' });
      
      const choices = [
        { name: 'Option 1', value: 'option1' },
        { name: 'Option 2', value: 'option2' }
      ];
      
      await promptChoice('Select an option:', choices, 'option1');
      
      expect(mockInquirer.prompt).toHaveBeenCalledWith([
        {
          type: 'list',
          name: 'choice',
          message: 'Select an option:',
          choices,
          default: 'option1'
        }
      ]);
    });

    it('should handle string union types', async () => {
      mockInquirer.prompt.mockResolvedValue({ choice: 'encrypt' });
      
      const choices = [
        { name: 'Encrypt backup', value: 'encrypt' as const },
        { name: 'Skip encryption', value: 'skip' as const }
      ];
      
      const result = await promptChoice('Choose encryption:', choices);
      
      expect(result).toBe('encrypt');
    });
  });

  describe('getPasswordFromEnv', () => {
    let originalEnv: string | undefined;

    beforeEach(() => {
      originalEnv = process.env.CONFIGREP_PASSWORD;
    });

    afterEach(() => {
      if (originalEnv !== undefined) {
        process.env.CONFIGREP_PASSWORD = originalEnv;
      } else {
        delete process.env.CONFIGREP_PASSWORD;
      }
    });

    it('should return password from environment variable', () => {
      process.env.CONFIGREP_PASSWORD = 'env-password-123';
      
      const result = getPasswordFromEnv();
      
      expect(result).toBe('env-password-123');
    });

    it('should return undefined when environment variable is not set', () => {
      delete process.env.CONFIGREP_PASSWORD;
      
      const result = getPasswordFromEnv();
      
      expect(result).toBeUndefined();
    });

    it('should return empty string when environment variable is empty', () => {
      process.env.CONFIGREP_PASSWORD = '';
      
      const result = getPasswordFromEnv();
      
      expect(result).toBe('');
    });
  });

  // Note: promptPassword is not tested here because it involves complex
  // interactive flows with console.log and retry logic that are difficult
  // to mock properly. It would be better tested with integration tests.
});