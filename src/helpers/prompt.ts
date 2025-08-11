import inquirer from 'inquirer';
import { validatePassword } from './crypto';

export async function promptPassword(confirm: boolean = true): Promise<string> {
  let password: string;
  
  while (true) {
    const { inputPassword } = await inquirer.prompt([
      {
        type: 'password',
        name: 'inputPassword',
        message: 'Enter password:',
        mask: '*'
      }
    ]);
    
    const validation = validatePassword(inputPassword);
    if (!validation.valid) {
      console.log(`❌ ${validation.error}`);
      continue;
    }
    
    password = inputPassword;
    break;
  }

  if (confirm) {
    while (true) {
      const { confirmPassword } = await inquirer.prompt([
        {
          type: 'password',
          name: 'confirmPassword',
          message: 'Confirm password:',
          mask: '*'
        }
      ]);
      
      if (confirmPassword !== password) {
        console.log('❌ Passwords do not match');
        continue;
      }
      
      break;
    }
  }

  return password;
}

export async function promptConfirmation(message: string, defaultValue: boolean = false): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: defaultValue
    }
  ]);
  
  return confirmed;
}

export async function promptChoice<T extends string>(
  message: string, 
  choices: { name: string; value: T }[],
  defaultValue?: T
): Promise<T> {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message,
      choices,
      default: defaultValue
    }
  ]);
  
  return choice;
}

export function getPasswordFromEnv(): string | undefined {
  return process.env.CONFIGREP_PASSWORD;
}