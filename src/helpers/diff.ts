import { compare } from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
import type { VersionDelta } from '../types/backup';

export function generateJsonPatch(oldData: any, newData: any): VersionDelta[] {
  const patches = compare(oldData, newData);
  
  return patches.map((patch: Operation): VersionDelta => {
    const delta: VersionDelta = {
      op: patch.op as 'add' | 'remove' | 'replace',
      path: patch.path
    };

    if ('value' in patch) {
      delta.value = patch.value;
    }

    if (patch.op === 'replace' && oldData) {
      try {
        const pathParts = patch.path.split('/').slice(1);
        let current = oldData;
        for (const part of pathParts) {
          if (current && typeof current === 'object' && part) {
            current = current[part];
          }
        }
        delta.oldValue = current;
      } catch {
        // Ignore errors when trying to get old value
      }
    }

    return delta;
  });
}

export function applyPatches(data: any, patches: VersionDelta[]): any {
  let result = JSON.parse(JSON.stringify(data));
  
  for (const patch of patches) {
    try {
      const pathParts = patch.path.split('/').slice(1);
      
      if (patch.op === 'add' || patch.op === 'replace') {
        let current = result;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (part && !(part in current)) {
            current[part] = {};
          }
          if (part) {
            current = current[part];
          }
        }
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart) {
          current[lastPart] = patch.value;
        }
      } else if (patch.op === 'remove') {
        let current = result;
        for (let i = 0; i < pathParts.length - 1; i++) {
          const part = pathParts[i];
          if (!part || !(part in current)) {
            break;
          }
          current = current[part];
        }
        const lastPart = pathParts[pathParts.length - 1];
        if (current && typeof current === 'object' && lastPart && lastPart in current) {
          delete current[lastPart];
        }
      }
    } catch (error) {
      console.warn(`Failed to apply patch ${patch.op} at ${patch.path}:`, error);
    }
  }
  
  return result;
}

export function generateReadableDiff(patches: VersionDelta[]): string[] {
  return patches.map(patch => {
    const path = patch.path.replace(/\//g, '.').substring(1) || 'root';
    
    switch (patch.op) {
      case 'add':
        return `+ ${path}: ${JSON.stringify(patch.value)}`;
      case 'remove':
        return `- ${path}: ${patch.oldValue ? JSON.stringify(patch.oldValue) : '(removed)'}`;
      case 'replace':
        return `~ ${path}: ${patch.oldValue ? JSON.stringify(patch.oldValue) : '(unknown)'} → ${JSON.stringify(patch.value)}`;
      default:
        return `? ${path}: ${patch.op}`;
    }
  });
}