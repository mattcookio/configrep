# ConfiGREP Backup Feature - Implementation Plan

## Overview
Add incremental backup functionality to ConfiGREP that captures config file changes over time with optional encryption and automatic git integration.

## Key Features
- **Incremental Versioning**: Initial full backup (v1) followed by delta-only changes (v2+)
- **Optional Encryption**: User choice - encrypt with password OR skip encryption (auto-added to .gitignore)
- **Git Integration**: Automatic .gitignore management based on encryption status
- **Interactive Browsing**: Miller columns UI for exploring backup versions
- **Secure by Default**: When encrypted, uses AES-256-GCM with PBKDF2 (210k iterations)

## Architecture Principles
- Follow existing ConfiGREP patterns for consistency
- Reuse existing helpers (discovery, parse, config)
- Match UI/UX patterns from MillerColumns component
- Comprehensive test coverage for all helpers
- Shared utilities for common operations

## File Structure

### New Files to Create

#### 1. `src/types/backup.ts`
TypeScript interfaces for backup data model:
- `BackupManifest`: Root backup structure
- `BackupFileRecord`: Per-file backup tracking
- `BackupVersion`: Version metadata with content/changes
- `VersionDelta`: JSON Patch operations (RFC 6902)
- `EncryptedBackup`: Encryption wrapper format

#### 2. `src/helpers/backup.ts`
Core backup logic:
- `createBackup()`: Generate initial/incremental backups
- `loadBackup()`: Load and decrypt backups
- `ensureGitIgnore()`: Auto-manage .gitignore
- `reconstructAtVersion()`: Rebuild content at any version
- `hashContent()`: Consistent content hashing

#### 3. `src/helpers/backup.test.ts`
Test coverage for:
- Initial backup creation with full content
- Incremental backups with delta changes
- Encrypted backup handling
- Git integration (.gitignore management)
- Version reconstruction from patches
- Content hashing consistency

#### 4. `src/helpers/diff.ts`
JSON diff utilities:
- `generateJsonPatch()`: Create RFC 6902 patches
- `applyPatches()`: Apply patches for reconstruction
- `generateReadableDiff()`: Human-readable diff format

#### 5. `src/helpers/diff.test.ts`
Test coverage for:
- Add/remove/replace operations
- Nested object handling
- Array modifications
- Multiple patch application
- Readable diff generation

#### 6. `src/helpers/crypto.ts`
Security utilities with hardcoded best practices:
- `encryptData()`: AES-256-GCM encryption
- `decryptData()`: Matching decryption
- Fixed security parameters (no user config needed):
  - Algorithm: AES-256-GCM
  - Key derivation: PBKDF2-SHA256
  - Iterations: 210,000 (OWASP 2023 recommendation)
  - Salt: 32 bytes
  - IV: 16 bytes

#### 7. `src/helpers/crypto.test.ts`
Test coverage for:
- Encryption with password
- Unique salt/IV generation
- Decryption with correct/incorrect password
- Tamper detection (data/auth tag)
- Large data handling
- Complex nested structures

#### 8. `src/helpers/prompt.ts`
Shared prompting utilities:
- `promptPassword()`: Password input with optional confirmation
- `promptConfirmation()`: Yes/no prompts
- Extracted from existing interactive code for reuse

#### 9. `src/helpers/prompt.test.ts`
Test coverage for:
- Password prompting with/without confirmation
- Password mismatch retry logic
- Password length validation
- Confirmation prompts

#### 10. `src/components/BackupViewer.tsx`
Interactive backup browser following MillerColumns pattern:
- Three-column layout: Files → Versions → Content/Changes
- Same keyboard navigation (arrows, q to quit)
- Additional shortcuts: d (diff), r (restore), c (copy)
- Same visual styling (cyan headers, dim help text)
- Same scrolling and terminal handling

### Files to Modify

#### 1. `src/index.ts`
Add backup functionality:
- New commands: `backup`, `backup-view`, `backup-diff`, `backup-restore`
- Short aliases: `bk`, `bv`
- Integration with existing ConfigExplorer class
- Interactive mode menu additions:
  - "Backup Configs" option
  - "View Backup" option
- Reuse existing option handling (dir, ignore, depth)

#### 2. `src/types.ts`
- Export backup types: `export * from './types/backup'`

#### 3. `package.json`
- Add dependency: `fast-json-patch` (RFC 6902 implementation)
- Ensure test scripts are configured

## Data Model

### Backup Structure
```typescript
interface BackupManifest {
  version: "1.0.0";
  created: string;      // ISO timestamp of first backup
  lastModified: string; // ISO timestamp of last backup
  encrypted?: boolean;  // Present and true if encrypted
  files: BackupFileRecord[];
}

interface BackupFileRecord {
  id: string;           // Hash of original path
  originalPath: string; // Relative path from root
  fileName: string;
  fileType: ConfigFile['type'];
  versions: BackupVersion[];
}

interface BackupVersion {
  versionNumber: number;
  timestamp: string;
  hash: string;         // Content hash for comparison
  content?: any;        // Full content (v1 only)
  changes?: VersionDelta[]; // Delta changes (v2+)
}

interface VersionDelta {
  op: 'add' | 'remove' | 'replace';
  path: string;         // JSON Pointer (RFC 6901)
  value?: any;
  oldValue?: any;       // For debugging/rollback
}
```

### Encryption Wrapper
When password is provided, the entire BackupManifest is encrypted:
```typescript
interface EncryptedBackup {
  encrypted: true;
  algorithm: 'aes-256-gcm';
  salt: string;         // Base64
  iv: string;           // Base64
  authTag: string;      // Base64
  iterations: 210000;   // Hardcoded for security
  data: string;         // Base64 encrypted BackupManifest
}
```

## Command Structure

### CLI Commands
```bash
# Create/update backup
cfg backup [options]
  --password [pass]    # Encrypt (prompts if no value)
  --output <file>      # Default: configrep.backup.json
  --dir <path>         # Directory to backup
  --ignore <patterns>  # Patterns to ignore
  --depth <number>     # Max depth
  --dry-run           # Preview changes without writing

# View backup interactively
cfg backup-view [file]       # Interactive backup browser

# Compare versions
cfg backup-diff [file]       # Show differences
  --file-path <path>         # Specific file to diff
  --from <version>           # Starting version
  --to <version>             # Ending version

# Restore from backup
cfg backup-restore [file]    # Restore config file
  --file-path <path>         # File to restore
  --version <number>         # Version to restore
  --output <path>            # Output path

# Short aliases
cfg bk                       # backup
cfg bv                       # backup-view
```

### Interactive Mode Integration
Main menu additions:
```
What would you like to do?
  Browse
  Search
  ──────────
  Backup Configs    <- NEW
  View Backup       <- NEW
  ──────────
  Exit
```

## User Workflows

### 1. Unencrypted Backup (Auto-gitignore)
```bash
$ cfg backup
Scanning for config files...
Found 12 config files
Creating backup...
✅ Backup created: configrep.backup.json
   Files: 12
   Changes detected: 0 (initial backup)
   ⚠️  Unencrypted (added to .gitignore)
```

### 2. Encrypted Backup (Git-safe)
```bash
$ cfg backup --password
Enter password: ********
Confirm password: ********
Scanning for config files...
Found 12 config files
Creating backup...
✅ Backup created: configrep.backup.json
   Files: 12
   Changes detected: 3
   🔒 Encrypted (safe for git)
```

### 3. Interactive Backup Creation
```
Select: Backup Configs
Scanning for config files...
Found 12 config files
Existing backup from 2024-01-01 12:00:00

Encrypt backup with password? (Y/n): n
Creating backup...
✅ Backup created: configrep.backup.json
   Files: 12
   Changes detected: 2
   ⚠️  Unencrypted (added to .gitignore)

View backup now? (y/N): y
[Opens BackupViewer]
```

## Git Integration Logic

### Automatic .gitignore Management
```typescript
if (isEncrypted) {
  // Encrypted backups are safe to commit
  console.log('💡 Backup is encrypted and safe to commit if desired');
  console.log('   Add to .gitignore if you prefer not to track it');
} else {
  // Unencrypted backups MUST be gitignored
  addToGitIgnore('configrep.backup.json');
  console.log('⚠️  Added configrep.backup.json to .gitignore (unencrypted)');
}
```

## Security Specifications

### Encryption Parameters (Hardcoded)
- **Algorithm**: AES-256-GCM (authenticated encryption)
- **Key Derivation**: PBKDF2-SHA256
- **Iterations**: 210,000 (OWASP 2023 recommendation)
- **Salt Size**: 32 bytes (unique per encryption)
- **IV Size**: 16 bytes (unique per encryption)
- **Key Length**: 32 bytes (256 bits)

### Password Handling
- Never accepted via command line arguments (prevents shell history exposure)
- Only via:
  - Interactive prompt (masked input)
  - Environment variable (`CONFIGREP_PASSWORD`)
  - `--password` flag triggers prompt

## Test Coverage Requirements

### Helper Test Coverage
| Helper | Test Areas |
|--------|------------|
| `backup.ts` | • Initial backup creation<br>• Incremental backups<br>• Encryption handling<br>• Git integration<br>• Version reconstruction<br>• Content hashing |
| `diff.ts` | • JSON patch generation<br>• Patch application<br>• Nested objects<br>• Arrays<br>• Readable diffs |
| `crypto.ts` | • Encryption/decryption<br>• Password validation<br>• Unique salt/IV<br>• Tamper detection<br>• Large data |
| `prompt.ts` | • Password prompting<br>• Confirmation<br>• Validation<br>• Retry logic |

### Coverage Goals
- 100% coverage for all helper functions
- Edge cases: corrupted backups, missing files, wrong passwords
- Integration tests for full backup/restore workflows

## Implementation Order

### Phase 1: Core Backup Logic
1. Create `src/types/backup.ts`
2. Create `src/helpers/backup.ts` with basic backup/restore
3. Create `src/helpers/backup.test.ts`
4. Create `src/helpers/diff.ts` for change detection
5. Create `src/helpers/diff.test.ts`
6. Add `backup` command to CLI
7. Test with unencrypted backups

### Phase 2: Encryption & Security
1. Create `src/helpers/crypto.ts` with secure defaults
2. Create `src/helpers/crypto.test.ts`
3. Create `src/helpers/prompt.ts` (extract from existing)
4. Create `src/helpers/prompt.test.ts`
5. Implement encrypted backup format
6. Add git integration (.gitignore handling)
7. Add password prompting to backup command

### Phase 3: Backup Viewing
1. Create `src/components/BackupViewer.tsx`
2. Add `backup-view` command
3. Implement version reconstruction
4. Add diff visualization
5. Add `backup-diff` and `backup-restore` commands

### Phase 4: Interactive Integration
1. Add backup options to main interactive menu
2. Create interactive backup flow
3. Integrate BackupViewer into interactive mode
4. Add keyboard shortcuts and help text
5. Polish UX with loading states and confirmations

## Success Criteria

- [x] Incremental backups with v1 full + v2+ deltas
- [x] User choice: encrypt OR auto-gitignore (never both)
- [x] Secure-by-default encryption (AES-256-GCM, PBKDF2 210k)
- [x] Automatic .gitignore management for unencrypted backups
- [x] Interactive backup browser with Miller columns
- [x] Password never in shell history
- [x] Works with all existing config file types
- [x] Respects existing ignore patterns and depth settings
- [x] Clear visual feedback for encrypted vs unencrypted
- [x] Version comparison and restoration capabilities
- [x] 100% test coverage for all helpers
- [x] Follows existing ConfiGREP patterns throughout

## Notes

### User Choice on Encryption
The system explicitly supports two modes:
1. **Encrypted**: Password-protected, safe for git, user notified it can be committed
2. **Unencrypted**: No password, automatically added to .gitignore, warned not to commit

This gives users flexibility while maintaining security best practices by default.

### Pattern Consistency
All new code follows existing ConfiGREP patterns:
- Helpers in `src/helpers/` with corresponding test files
- Components follow React/Ink patterns from MillerColumns
- Commands use existing option merging and config loading
- UI maintains same visual style and keyboard navigation
- File discovery and parsing reuse existing utilities