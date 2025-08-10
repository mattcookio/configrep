# ConfiGREP 🔍

A CLI tool for exploring configuration files. Auto-discovers `.env`, `.json`, `.yaml`, `.toml`, `.ini` files and presents them in a clean tree structure with interactive browsing and search.

## Installation

```bash
# Run directly (no installation)
npx configrep interactive
bunx configrep list
pnpm dlx configrep search "database"

# Install globally
npm install -g configrep
```

## Configuration

Create a `configrep.json` file to set defaults:

```bash
configrep init  # Creates config in current directory
```

```json
{
  "directory": ".",
  "ignore": ["node_modules", "dist", ".git", "*.tmp"],
  "depth": 5,
  "defaultCommand": "interactive"
}
```

CLI flags override config file settings.

## Usage

```bash
# Interactive explorer (Miller Columns interface)
configrep interactive
configrep i  # shorthand

# List all config files
configrep list
configrep ls  # shorthand

# Show all configuration entries
configrep show
configrep s  # shorthand

# Search configuration entries
configrep search "database"
configrep search "API" --keys-only
configrep search "localhost" --values-only
```

### Interactive Mode Features

- **Miller Columns Navigation**: Browse through directories and files in a hierarchical view
- **JSON Drilling**: For nested JSON values, press `→` or `l` to progressively drill into objects and arrays
- **Quick Actions**: Press `Enter` on any config value to access copy/search actions
- **Visual Indicators**: Nested values show `{n}` for objects or `[n]` for arrays to indicate drillable content

## Options

- `--dir <path>` - Directory to search
- `--ignore <pattern...>` - Glob patterns to ignore
- `--depth <number>` - Maximum directory depth (default: 5)
- `--keys-only` - Search keys only (search command)
- `--values-only` - Search values only (search command)

## Supported Formats

ENV, JSON, YAML, TOML, INI files

## Examples

```bash
# Find database configurations
configrep search "database\|db\|sql" --keys-only

# Audit API keys
configrep search "key\|token\|secret"

# Ignore build artifacts
configrep list --ignore "node_modules" "dist" ".git"

# Setup project config
configrep init
```

## License

MIT