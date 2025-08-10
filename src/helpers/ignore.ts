import { relative } from 'path';

export function globToRegex(pattern: string): RegExp {
  if (!pattern) return new RegExp('^$');
  let expandedPattern = pattern;
  const braceMatch = pattern.match(/\{([^}]+)\}/);
  if (braceMatch && braceMatch[1]) {
    const options = braceMatch[1].split(',');
    expandedPattern = `(${options.join('|')})`;
    expandedPattern = pattern.replace(/\{[^}]+\}/, expandedPattern);
  }
  let regexPattern = expandedPattern
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '§STAR§')
    .replace(/\?/g, '§QUESTION§');
  regexPattern = regexPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  regexPattern = regexPattern.replace(/\\\[([^\]]*)\\\]/g, (_, chars: string) => {
    if (chars.startsWith('!')) {
      return `[^${chars.slice(1)}]`;
    }
    return `[${chars}]`;
  });
  regexPattern = regexPattern
    .replace(/§DOUBLESTAR§/g, '.*')
    .replace(/§STAR§/g, '[^/]*')
    .replace(/§QUESTION§/g, '.');
  return new RegExp(`^${regexPattern}$`);
}

export function matchesPathSegments(pattern: string, relativePath: string): boolean {
  const pathParts = relativePath.split('/');
  const patternParts = pattern.split('/');
  for (let i = 0; i <= pathParts.length - patternParts.length; i++) {
    let matches = true;
    for (let j = 0; j < patternParts.length; j++) {
      const pathPart = pathParts[i + j];
      const patternPart = patternParts[j];
      if (!pathPart || !patternPart || !globToRegex(patternPart).test(pathPart)) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

export function matchesAnyPathSegment(pattern: string, relativePath: string): boolean {
  const pathParts = relativePath.split('/');
  const regex = globToRegex(pattern);
  return pathParts.some(part => regex.test(part));
}

export function matchesGlobPattern(
  pattern: string,
  name: string,
  fullPath: string,
  rootDirectory: string
): boolean {
  const relativePath = relative(rootDirectory, fullPath);
  if (pattern.startsWith('/')) {
    const cleanPattern = pattern.slice(1);
    return globToRegex(cleanPattern).test(relativePath);
  } else if (pattern.includes('/')) {
    const regex = globToRegex(pattern);
    return regex.test(relativePath) || matchesPathSegments(pattern, relativePath);
  } else {
    const regex = globToRegex(pattern);
    return regex.test(name) || matchesAnyPathSegment(pattern, relativePath);
  }
}

export function shouldIgnore(
  name: string,
  fullPath: string,
  ignorePatterns: string[],
  rootDirectory: string
): boolean {
  for (const pattern of ignorePatterns) {
    if (matchesGlobPattern(pattern, name, fullPath, rootDirectory)) {
      return true;
    }
  }
  return false;
}
