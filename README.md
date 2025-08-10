# ConfiGREP 🔍

**Find any config value in seconds.** A fast CLI tool that discovers and searches through all your configuration files (.env, .json, .yaml, .toml, .ini) with an intuitive Miller Columns interface.

## Why ConfiGREP?

Ever wondered where that API key is stored? Or which config file has the database URL? ConfiGREP instantly finds any configuration value across your entire project.

## Quick Start

```bash
# Run without installation
npx configrep

# Or install globally
npm install -g configrep
cfg  # Use the short 'cfg' command
```

## Core Features

- **Auto-discovery** - Finds all config files in your project automatically
- **Miller Columns UI** - Navigate configs like macOS Finder
- **Smart search** - Search by key, value, or both with regex support
- **Cross-format** - Works with .env, JSON, YAML, TOML, and INI files
- **Tree display** - View nested configs in hierarchical or flat format

## Commands & Examples

### Interactive Mode (Default)
```bash
cfg                    # Launch interactive explorer
cfg interactive        # Same as above
cfg i                  # Shorthand

# Navigate with arrow keys, filter with 'f', search with '/'
# Press Enter on any value to copy or find similar keys
```

### Search Configurations
```bash
# Find database connections
cfg search "database"
cfg search "postgres|mysql|mongo"

# Find all API keys and tokens
cfg search "key|token|secret|password"

# Search only in keys (useful for finding specific settings)
cfg search "timeout" --keys-only

# Search only in values (useful for finding hardcoded IPs/URLs)
cfg search "192.168" --values-only
cfg search "localhost|127.0.0.1" --values-only

# Find staging vs production values
cfg search "staging|prod|development"
```

### List Config Files
```bash
# See all config files in your project
cfg list
cfg ls                 # Shorthand

# Find configs in specific directories
cfg list --dir ./src
cfg list --dir ./config

# Exclude test configs
cfg list --ignore "*.test.*" "*.spec.*"
```

### Show Config Contents
```bash
# Display all configuration values
cfg show
cfg s                  # Shorthand

# Show specific file
cfg show --file .env
cfg show --file package.json

# Display as nested tree structure
cfg show --tree
cfg show --file tsconfig.json --tree

# Show configs from specific directory
cfg show --dir ./config
```

### Advanced Usage

#### Create a config file for defaults
```bash
cfg init

# Creates configrep.json:
{
  "directory": ".",
  "ignore": ["node_modules", "dist", ".git"],
  "depth": 5,
  "defaultCommand": "interactive"
}
```

#### Audit sensitive data
```bash
# Find potentially exposed secrets
cfg search "api_key|api_secret|private_key|access_token"

# Check for hardcoded passwords
cfg search "password" --values-only | grep -v "ENV\|env\|process"

# Find non-environment database URLs
cfg search "mongodb://|postgres://|mysql://" --values-only
```

#### Debug configuration issues
```bash
# Compare key names across files (finds typos/inconsistencies)
cfg show | grep "AUTH" | sort | uniq

# Find duplicate keys
cfg show | cut -d'=' -f1 | sort | uniq -d

# Check which configs are using environment variables
cfg search "\$\{.*\}" --values-only
```

#### Migration and refactoring
```bash
# Find all timeout settings to standardize
cfg search "timeout|ttl|expir" --keys-only

# Locate all external service URLs
cfg search "http://|https://" --values-only

# Find all port configurations
cfg search "port" --keys-only
```

## Options

| Option | Description |
|--------|-------------|
| `--dir <path>` | Directory to search (default: current) |
| `--ignore <patterns...>` | Glob patterns to ignore |
| `--depth <number>` | Max directory depth (default: 5) |
| `--tree` | Display nested structure (show/search) |
| `--keys-only` | Search only in keys |
| `--values-only` | Search only in values |
| `--file <path>` | Target specific file |
| `--all` | Show all matches, not just first |

## Tips

- Use `cfg` in your project root for best results
- Create `configrep.json` to save your preferred settings
- Pipe output to other tools: `cfg search "api" | grep prod`
- Use `--tree` flag for better visualization of nested configs

## License

MIT