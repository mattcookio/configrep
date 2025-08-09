# ConfiGREP 🔍

A powerful CLI tool for exploring and managing configuration files across your projects. ConfiGREP automatically discovers, parses, and presents configuration files in an intuitive tree structure with both interactive and command-line interfaces.

## Features

- 🔍 **Auto-Discovery**: Automatically finds config files (`.env`, `.json`, `.yaml`, `.toml`, `.ini`, etc.)
- 🌳 **Tree Visualization**: Clean tree structure showing files and their configuration entries
- 🎯 **Interactive Mode**: Miller Columns interface for browsing configurations like macOS Finder
- 🔎 **Real-time Search**: Filter configuration entries as you type
- 📋 **Clipboard Integration**: Copy keys, values, or JSON formats to clipboard
- 🚫 **Smart Filtering**: Powerful glob pattern support for ignoring files/directories
- 🎨 **Clean Output**: Minimal, focused display without technical clutter

## Installation

### Using Package Managers (Recommended)

```bash
# Run directly with npx (no installation needed)
npx configrep interactive

# Run with bunx
bunx configrep list

# Run with pnpm
pnpm dlx configrep search "database"

# Install globally
npm install -g configrep
# or
bun install -g configrep
```

### From Source

```bash
# Clone the repository
git clone https://github.com/yourusername/configrep.git
cd configrep

# Install dependencies
bun install

# Make it globally available (optional)
bun link
```

## Configuration

ConfiGREP supports a `configrep.json` configuration file to set default options and preferences.

### Creating a Configuration File

```bash
# Create configrep.json in current directory
configrep init

# Create configrep.json in specific directory
configrep init /path/to/project
```

### Configuration Options

```json
{
  "directory": ".",
  "ignore": [
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".git",
    "*.tmp",
    "*.log"
  ],
  "depth": 5,
  "defaultCommand": "interactive",
  "fileTypes": {
    "env": true,
    "json": true,
    "yaml": true,
    "toml": true,
    "ini": true
  }
}
```

**Configuration Properties:**
- `directory` - Directory to search (relative to config file location)
- `ignore` - Array of glob patterns to ignore
- `depth` - Maximum directory depth to scan
- `defaultCommand` - Default command when none specified (`list`, `show`, `interactive`)
- `fileTypes` - Enable/disable specific file type parsing

**Priority Order:**
1. Command-line flags (highest priority)
2. `configrep.json` configuration file
3. Built-in defaults (lowest priority)

## Usage

### Interactive Mode

Launch the full interactive explorer with Miller Columns navigation:

```bash
configrep interactive
# or
configrep i
```

**Interactive Features:**
- Navigate with arrow keys or vim-style `hjkl`
- Browse configuration files and their entries
- Real-time search filtering
- Copy configuration values to clipboard
- Action menus for each configuration entry

### Command Line Interface

#### List Configuration Files

```bash
# List all config files in current directory
configrep list

# List with custom depth and ignore patterns
configrep list --depth 3 --ignore "node_modules" "dist" "*.tmp"

# Search specific directory
configrep list --dir /path/to/project
```

**Example Output:**
```
│
├── 📁 src
│   └── 📋 .env.local
├── 📁 config
│   ├── 📋 database.json
│   └── 📋 redis.yaml
├── 📋 .env
├── 📋 package.json
└── 📋 docker-compose.yml
```

#### Show Configuration Entries

```bash
# Show all configuration entries from all files
configrep show

# Show entries from specific file
configrep show --file .env

# Show entries from files matching patterns
configrep show --glob "*.env*" "config/*.json"
```

**Example Output:**
```
│
├── 📋 .env
│   ├── 🔑 DATABASE_URL = postgresql://user:pass@localhost:5432/mydb
│   ├── 🔑 API_KEY = sk-1234567890abcdef
│   └── 🔑 NODE_ENV = development
└── 📋 config.json
    ├── 🔑 server.host = localhost
    ├── 🔑 server.port = 8080
    └── 🔑 database.host = db.example.com
```

#### Search Configuration Entries

```bash
# Search for entries containing "database"
configrep search database

# Search only in keys
configrep search "API" --keys-only

# Search only in values
configrep search "localhost" --values-only
```

**Example Output:**
```
│
├── 📋 .env
│   └── 🔑 DATABASE_URL = postgresql://user:pass@localhost:5432/mydb
└── 📋 config.json
    ├── 🔑 database.host = db.example.com
    ├── 🔑 database.name = production_db
    └── 🔑 database.port = 5432
```

## Supported File Formats

ConfiGREP automatically detects and parses these configuration file formats:

- **Environment Files**: `.env`, `.env.local`, `.env.development`, `.env.production`
- **JSON**: `config.json`, `package.json`, `tsconfig.json`, `appsettings.json`
- **YAML**: `config.yaml`, `config.yml`, `docker-compose.yml`
- **TOML**: `config.toml`, `pyproject.toml`, `Cargo.toml`
- **INI**: `config.ini`, `.gitconfig`
- **JavaScript Config**: `.babelrc.json`, `jest.config.json`

## Ignore Patterns

ConfiGREP supports powerful glob patterns for ignoring files and directories:

```bash
# Common ignore patterns
configrep list --ignore "node_modules" "dist" "build" "coverage"

# Glob patterns
configrep list --ignore "*.tmp" "**/.git/**" "test/**"

# Complex patterns
configrep list --ignore "**/node_modules/**" "*.{log,tmp,cache}"
```

**Pattern Examples:**
- `node_modules` - Ignore any directory named node_modules
- `*.tmp` - Ignore all .tmp files
- `**/.git/**` - Ignore .git directories and their contents
- `test/**` - Ignore everything in test directories
- `*.{js,ts}` - Ignore .js and .ts files

## Command Options

### Global Options

- `--dir <path>` - Directory to search (default: current directory)
- `--ignore <pattern...>` - Glob patterns to ignore

### Init Command

- `configrep init [directory]` - Create example configrep.json config file
- If no directory specified, creates config in current directory
- Fails if configrep.json already exists

### List Command

- `-d, --depth <number>` - Maximum directory depth to scan (default: 5)
- `-g, --glob <pattern...>` - List files matching glob patterns

### Show Command

- `-f, --file <path>` - Show entries from specific file only
- `-g, --glob <pattern...>` - Show entries from files matching patterns
- `-a, --all` - Show all matching files instead of just the first one

### Search Command

- `-k, --keys-only` - Search keys only
- `-v, --values-only` - Search values only

## Use Cases

### DevOps & Infrastructure
- **Configuration Auditing**: Review settings across microservices
- **Environment Comparison**: Compare configurations between dev/staging/prod
- **Secret Detection**: Find sensitive data in configuration files
- **Deployment Verification**: Ensure correct configurations are deployed

### Development
- **Project Onboarding**: Quickly understand a project's configuration structure
- **Debugging**: Find configuration issues causing application problems
- **Refactoring**: Identify configuration dependencies before changes
- **Documentation**: Generate configuration documentation

### Security
- **Credential Scanning**: Search for API keys, passwords, and tokens
- **Compliance Checking**: Verify configuration meets security standards
- **Access Review**: Audit database connections and service endpoints

## Examples

### Find All Database Configurations
```bash
configrep search "database\|db\|sql" --keys-only
```

### Audit API Keys in Project
```bash
configrep search "key\|token\|secret" --dir ~/projects/app1
```

### Compare Environment Files
```bash
configrep show --glob ".env*" --all
```

### Clean Project Scan (Ignore Build Artifacts)
```bash
configrep list --ignore "node_modules" "dist" "build" "coverage" ".git"
```

### Setup Project Configuration
```bash
# Initialize config file with sensible defaults
configrep init

# Customize the generated configrep.json, then run commands
configrep interactive  # Uses config file settings
```

## Development

### Requirements
- [Bun](https://bun.sh) runtime
- Node.js compatible environment

### Building
```bash
# Install dependencies
bun install

# Run directly
bun run index.ts

# Build for distribution
bun build index.ts --outdir dist --target bun
```

### Contributing
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Changelog

### v1.0.0
- Initial release
- Interactive Miller Columns interface
- Command-line interface with list, show, and search commands
- Support for ENV, JSON, YAML, TOML, and INI formats
- Glob pattern ignore functionality
- Clipboard integration
- Clean tree visualization

---

**ConfiGREP** - Making configuration exploration simple and intuitive. 🚀