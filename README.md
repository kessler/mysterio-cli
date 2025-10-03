# Mysterio CLI

A simplified command-line interface for [Mysterio](https://github.com/kessler/mysterio) - configuration and secrets management for Node.js applications with AWS Secrets Manager integration.

## Features

- 🚀 **Simplified Commands** - Only 5 core commands to remember
- 🔧 **Unified Operations** - Single commands for reading and writing configs
- 🌍 **Environment Management** - Create and manage configuration environments
- 🔐 **AWS Integration** - Seamless AWS Secrets Manager operations
- 📁 **Local Configuration** - JSON-based local config files
- 🔄 **Bidirectional Sync** - Sync between local and AWS

## Installation

```bash
npm install -g mysterio-cli
```

Or use locally in your project:

```bash
npm install mysterio-cli
```

## Quick Start

```bash
# Initialize project
mysterio init

# Create an environment
mysterio env create production

# Set configuration values
mysterio set API_KEY "secret123" --env production

# Get configuration
mysterio get --env production

# Push to AWS
mysterio aws push production
```

## Core Commands

### 1. `mysterio init`

Initialize a new Mysterio project with configuration structure.

```bash
mysterio init [options]
```

**Options:**
- `-p, --package-name <name>` - Package name for the project
- `-d, --config-dir <path>` - Configuration directory (default: `./config`)
- `-e, --environments <envs...>` - Initial environments (default: `local`, `development`, `production`)
- `--aws-region <region>` - AWS region (default: `us-east-1`)

**Example:**
```bash
mysterio init --name my-app --environments local staging production
```

### 2. `mysterio get`

Retrieve configuration from any source (local, AWS, or merged).

```bash
mysterio get [options]
```

**Options:**
- `-e, --env <environment>` - Target environment (default: `NODE_ENV` or `local`)
- `-s, --source <type>` - Source: `local`, `aws`, or `merged` (default: `merged`)
- `-f, --format <format>` - Output format: `json` or `env` (default: `json`)
- `-d, --config-dir <path>` - Configuration directory (default: `./config`)
- `--save <file>` - Save output to file

**Examples:**
```bash
# Get merged configuration for production
mysterio get --env production

# Get only AWS secrets
mysterio get --env production --source aws

# Save as .env file
mysterio get --env production --format env --save .env.production

# Get local configuration only
mysterio get --env development --source local
```

### 3. `mysterio set`

Set configuration values in local files or AWS.

```bash
mysterio set <key> <value> [options]
```

**Options:**
- `-e, --env <environment>` - Target environment (default: `NODE_ENV` or `local`)
- `-t, --target <type>` - Target: `local`, `aws`, or `both` (default: `local`)
- `-d, --config-dir <path>` - Configuration directory (default: `./config`)
- `-i, --interactive` - Interactive mode for multiple values

**Examples:**
```bash
# Set a local config value
mysterio set API_URL "https://api.example.com" --env production

# Set a secret in AWS
mysterio set DB_PASSWORD "secret123" --env production --target aws

# Set in both local and AWS
mysterio set API_KEY "key123" --env production --target both

# Interactive mode for multiple values
mysterio set --interactive --env staging
```

### 4. `mysterio env`

Manage configuration environments.

```bash
mysterio env <action> [name] [options]
```

**Actions:**
- `create <name>` - Create new environment
- `list` - List all environments
- `delete <name>` - Delete an environment

**Options:**
- `-d, --config-dir <path>` - Configuration directory (default: `./config`)
- `--from <env>` - Create from template environment
- `--with-aws` - Also manage in AWS Secrets Manager
- `--show-aws` - Show AWS status when listing
- `--force` - Force deletion without recovery (AWS)
- `--days <days>` - Recovery window for AWS deletion (7-30)

**Examples:**
```bash
# Create new environment
mysterio env create staging

# Create from template
mysterio env create qa --from production

# Create with AWS secret
mysterio env create production --with-aws

# List environments with AWS status
mysterio env list --show-aws

# Delete environment (local and AWS)
mysterio env delete old-env --with-aws --force
```

### 5. `mysterio aws`

AWS Secrets Manager operations.

```bash
mysterio aws <action> <environment> [options]
```

**Actions:**
- `push` - Push local config to AWS
- `pull` - Pull AWS secrets to local
- `sync` - Bidirectional sync
- `delete` - Delete AWS secret

**Options:**
- `-p, --package-name <name>` - Package name (defaults to `.mysteriorc`)
- `-r, --region <region>` - AWS region (default: `us-east-1`)
- `-d, --config-dir <path>` - Configuration directory (default: `./config`)
- `--override` - Override existing without prompting
- `--prefer <source>` - For sync: prefer `local` or `aws` (default: `local`)
- `--force` - For delete: immediate deletion without recovery
- `--days <days>` - For delete: recovery window (7-30)

**Examples:**
```bash
# Push local config to AWS
mysterio aws push production

# Pull AWS secrets to local
mysterio aws pull production --override

# Sync with local preference
mysterio aws sync staging --prefer local

# Delete AWS secret with recovery
mysterio aws delete old-env --days 7
```

## Configuration Structure

### `.mysteriorc`

Project settings file:

```json
{
  "packageName": "my-app",
  "configDirPath": "./config",
  "awsRegion": "us-east-1"
}
```

### Configuration Files

Stored as JSON in your config directory:

- `default.json` - Shared default configuration
- `[environment].json` - Environment-specific configuration

**Example `default.json`:**
```json
{
  "packageName": "my-app",
  "region": "us-east-1",
  "apiVersion": "v1"
}
```

**Example `production.json`:**
```json
{
  "environment": "production",
  "debug": false,
  "apiUrl": "https://api.example.com"
}
```

### AWS Secrets Naming

Secrets are stored in AWS Secrets Manager as:
```
[packageName]/[environment]
```

Example: `my-app/production`

## Common Workflows

### Local Development

```bash
# Initialize project
mysterio init

# Create local environment
mysterio env create local

# Set configuration
mysterio set DATABASE_URL "postgres://localhost:5432/dev"

# Get configuration
mysterio get
```

### Production Setup

```bash
# Create production environment
mysterio env create production --with-aws

# Set secrets in AWS
mysterio set API_KEY "prod-key-123" --env production --target aws
mysterio set DB_PASSWORD "secret" --env production --target aws

# Get merged configuration
mysterio get --env production --source merged
```

### Environment Cloning

```bash
# Create staging from production
mysterio env create staging --from production

# Push to AWS
mysterio aws push staging

# Modify specific values
mysterio set API_URL "https://staging-api.example.com" --env staging
```

### Configuration Sync

```bash
# Pull AWS secrets to local
mysterio aws pull production

# Make local changes
mysterio set NEW_FEATURE "enabled" --env production

# Sync back to AWS
mysterio aws sync production --prefer local
```

## Environment Variables

The CLI respects these environment variables:

- `NODE_ENV` - Default environment when not specified
- `DEBUG=mysterio-cli` - Enable debug logging
- `AWS_ACCESS_KEY_ID` - AWS credentials
- `AWS_SECRET_ACCESS_KEY` - AWS credentials

## AWS Permissions

Required AWS IAM permissions:

- `secretsmanager:GetSecretValue`
- `secretsmanager:CreateSecret`
- `secretsmanager:UpdateSecret`
- `secretsmanager:DeleteSecret`
- `secretsmanager:PutSecretValue`
- `secretsmanager:ListSecrets`

## Programmatic Usage

```javascript
import {
  initMysterio,
  getConfig,
  setConfig,
  envCommand,
  awsCommand
} from 'mysterio-cli'

// Get configuration
await getConfig({
  env: 'production',
  source: 'merged',
  format: 'json'
})

// Set configuration
await setConfig('API_KEY', 'secret123', {
  env: 'production',
  target: 'aws'
})

// AWS operations
await awsCommand('push', 'production', {
  override: true
})

// Environment management
await envCommand('create', 'staging', {
  from: 'production',
  withAws: true
})
```

## Migration from Legacy Commands

| Old Command | New Command |
|------------|-------------|
| `mysterio read` | `mysterio get` |
| `mysterio merge` | `mysterio get --source merged` |
| `mysterio secrets --get` | `mysterio get --source aws` |
| `mysterio secrets --set` | `mysterio set KEY VALUE --target aws` |
| `mysterio create-config` | `mysterio aws push` |
| `mysterio delete-config` | `mysterio aws delete` |
| `mysterio list` | `mysterio env list` |

## License

Apache-2.0

## Author

Yaniv Kessler

## Contributing

Issues and pull requests are welcome at [GitHub](https://github.com/kessler/mysterio-cli).

## Related

- [Mysterio](https://github.com/kessler/mysterio) - Core configuration and secrets management library
