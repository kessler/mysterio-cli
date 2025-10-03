import fs from 'node:fs/promises'
import path from 'node:path'
import util from 'node:util'
import { Mysterio, getSecretsClient } from 'mysterio'
import { input, confirm, select, password } from '@inquirer/prompts'
import { humanId } from 'human-id'
import { config } from './config.mjs'
import { SecretsManagerClient, CreateSecretCommand, UpdateSecretCommand, DeleteSecretCommand, ResourceExistsException, ResourceNotFoundException } from '@aws-sdk/client-secrets-manager'

const debug = util.debuglog('mysterio-cli')

export async function initMysterio(options) {
  debug('Initializing Mysterio project with options:', options)

  const packageName = options.packageName || await input({
    message: 'Enter package name:',
    default: config.packageName || humanId({ separator: '-', capitalize: false })
  })

  const configDir = path.resolve(options.configDir)

  try {
    await fs.mkdir(configDir, { recursive: true })

    for (const env of options.environments) {
      const configFile = path.join(configDir, `${env}.json`)
      const defaultConfig = {
        environment: env,
        debug: env === 'local',
      }

      await fs.writeFile(
        configFile,
        JSON.stringify(defaultConfig, null, 2)
      )
      debug(`Created config file: ${configFile}`)
    }

    const defaultConfigFile = path.join(configDir, 'default.json')
    await fs.writeFile(
      defaultConfigFile,
      JSON.stringify({ packageName, region: options.awsRegion }, null, 2)
    )

    const mysterioRc = {
      packageName,
      configDirPath: options.configDir,
      awsRegion: options.awsRegion
    }
    await fs.writeFile('.mysteriorc', JSON.stringify(mysterioRc, null, 2))

    console.log(`✅ Mysterio initialized for project: ${packageName}`)
    console.log(`📁 Configuration directory: ${configDir}`)
    console.log(`🔧 Environments created: ${options.environments.join(', ')}`)

  } catch (error) {
    console.error('❌ Failed to initialize Mysterio:', error.message)
    throw error
  }
}

export async function readConfig(options) {
  debug('Reading configuration with options:', options)

  try {
    const mysterio = new Mysterio({
      env: options.env,
      configDirPath: options.configDir,
      ...config
    })

    let result

    if (options.secretsOnly) {
      result = await mysterio.getSecrets()
    } else if (options.localOnly) {
      result = await mysterio.getDefaultConfigs()
    } else if (options.merge) {
      result = await mysterio.getMerged()
    } else {
      result = await mysterio.getDefaultConfigs()
    }

    console.log(JSON.stringify(result, null, 2))

  } catch (error) {
    console.error('❌ Failed to read configuration:', error.message)
    throw error
  }
}

export async function createEnvironment(action, name, options) {
  debug('Managing environment:', action, name, options)

  const configDir = path.resolve(options.configDir)

  try {
    switch (action) {
      case 'create': {
        if (!name) {
          name = await input({ message: 'Enter environment name:' })
        }

        const configFile = path.join(configDir, `${name}.json`)

        let configData = { environment: name }

        if (options.template) {
          const templateFile = path.join(configDir, `${options.template}.json`)
          const templateData = await fs.readFile(templateFile, 'utf-8')
          configData = { ...JSON.parse(templateData), environment: name }
        }

        await fs.writeFile(configFile, JSON.stringify(configData, null, 2))
        console.log(`✅ Created environment: ${name}`)

        if (options.withSecrets && config.packageName) {
          console.log('📝 Note: Create secrets in AWS Secrets Manager with name:',
            `${config.packageName}/${name}`)
        }
        break
      }

      case 'list': {
        const files = await fs.readdir(configDir)
        const envs = files
          .filter(f => f.endsWith('.json') && f !== 'default.json')
          .map(f => f.replace('.json', ''))

        console.log('📋 Available environments:')
        envs.forEach(env => console.log(`  - ${env}`))
        break
      }

      case 'delete': {
        if (!name) {
          name = await input({ message: 'Enter environment name to delete:' })
        }

        const confirmed = await confirm({
          message: `Are you sure you want to delete environment '${name}'?`
        })

        if (confirmed) {
          const configFile = path.join(configDir, `${name}.json`)
          await fs.unlink(configFile)
          console.log(`✅ Deleted environment: ${name}`)
        }
        break
      }

      default:
        console.error(`❌ Unknown action: ${action}. Use 'create', 'list', or 'delete'`)
    }
  } catch (error) {
    console.error('❌ Failed to manage environment:', error.message)
    throw error
  }
}

export async function listEnvironments(options) {
  debug('Listing environments with options:', options)

  const configDir = path.resolve(options.configDir)

  try {
    const files = await fs.readdir(configDir)
    const envs = files
      .filter(f => f.endsWith('.json') && f !== 'default.json')
      .map(f => f.replace('.json', ''))

    console.log('📋 Available environments:')
    for (const env of envs) {
      console.log(`  📁 ${env}`)

      if (options.showSecrets && config.packageName) {
        console.log(`     🔐 Secret: ${config.packageName}/${env}`)
      }
    }
  } catch (error) {
    console.error('❌ Failed to list environments:', error.message)
    throw error
  }
}

export async function getSecrets(options) {
  debug('Managing secrets with options:', options)

  const packageName = options.packageName || config.packageName

  if (!packageName) {
    console.error('❌ Package name is required. Use --package-name or set in .mysteriorc')
    return
  }

  try {
    if (options.get) {
      const secretName = `${packageName}/${options.env}`
      const secretsClient = getSecretsClient(config.awsParams)
      const secrets = await secretsClient(secretName)

      console.log('🔐 Secrets retrieved:')
      console.log(JSON.stringify(secrets, null, 2))

    } else if (options.set) {
      console.log('🔐 Setting secrets interactively...')
      console.log('⚠️  Note: This is a scaffold. Implement AWS Secrets Manager update logic here')

      const secretName = `${packageName}/${options.env}`
      const numSecrets = await input({
        message: 'How many secrets to add?',
        validate: (v) => !isNaN(v) && v > 0
      })

      const secrets = {}
      for (let i = 0; i < parseInt(numSecrets); i++) {
        const key = await input({ message: `Secret key #${i+1}:` })
        const value = await password({ message: `Secret value for '${key}':` })
        secrets[key] = value
      }

      console.log('📝 Would save to AWS Secrets Manager:', secretName)
      console.log('🔑 Secrets structure:', Object.keys(secrets))

    } else if (options.list) {
      console.log(`📋 Secret names pattern for ${packageName}:`)
      const configDir = path.resolve(config.configDirPath || './config')
      const files = await fs.readdir(configDir)
      const envs = files
        .filter(f => f.endsWith('.json') && f !== 'default.json')
        .map(f => f.replace('.json', ''))

      for (const env of envs) {
        console.log(`  🔐 ${packageName}/${env}`)
      }
    }
  } catch (error) {
    console.error('❌ Failed to manage secrets:', error.message)
    throw error
  }
}

export async function mergeConfigs(options) {
  debug('Merging configurations with options:', options)

  try {
    const mysterio = new Mysterio({
      env: options.env,
      configDirPath: options.configDir,
      ...config
    })

    const merged = await mysterio.getMerged()

    let output
    if (options.output === 'env') {
      output = Object.entries(merged)
        .map(([key, value]) => `${key.toUpperCase()}=${JSON.stringify(value)}`)
        .join('\n')
    } else {
      output = JSON.stringify(merged, null, 2)
    }

    if (options.save) {
      await fs.writeFile(options.save, output)
      console.log(`✅ Merged configuration saved to: ${options.save}`)
    } else {
      console.log(output)
    }

  } catch (error) {
    console.error('❌ Failed to merge configurations:', error.message)
    throw error
  }
}

export async function createSecret(environment, options) {
  debug('Creating secret for environment:', environment, options)

  const packageName = options.packageName || config.packageName

  if (!packageName) {
    console.error('❌ Package name is required. Use --package-name or set in .mysteriorc')
    throw new Error('Package name not provided')
  }

  const secretName = `${packageName}/${environment}`
  const region = options.region || config.awsRegion || 'us-east-1'

  try {
    const client = new SecretsManagerClient({ region })

    let secretValue = options.initialValues
    
    if (!secretValue) {
      const configDir = path.resolve(options.configDir || config.configDirPath || './config')
      const configFile = path.join(configDir, `${environment}.json`)

      try {
        await fs.access(configFile)

        let useConfig = options.confirm === false

        if (options.confirm !== false) {
          useConfig = await confirm({
            message: `Config file for '${environment}' exists. Use it as initial secret values?`,
            default: true
          })
        }

        if (useConfig) {
          const configContent = await fs.readFile(configFile, 'utf-8')
          secretValue = configContent
          console.log(`📁 Using config from: ${configFile}`)
        } else {
          secretValue = '{}'
        }
      } catch {
        secretValue = '{}'
      }
    } else {
      if (typeof secretValue === 'string') {
        try {
          JSON.parse(secretValue)
        } catch (e) {
          console.error('❌ Invalid JSON for initial values')
          throw new Error('Initial values must be valid JSON')
        }
      }
    }

    let response
    try {
      const command = new CreateSecretCommand({
        Name: secretName,
        Description: options.description || `Secrets for ${packageName} - ${environment} environment`,
        SecretString: secretValue,
      })

      response = await client.send(command)

      console.log(`✅ Secret created successfully in AWS Secrets Manager`)
      console.log(`🔐 Secret Name: ${secretName}`)
      console.log(`🆔 Secret ARN: ${response.ARN}`)
      console.log(`📍 Region: ${region}`)

      if (response.VersionId) {
        console.log(`📌 Version ID: ${response.VersionId}`)
      }
    } catch (error) {
      if (error instanceof ResourceExistsException) {
        if (options.confirm === false) {
          console.error(`❌ Secret '${secretName}' already exists in AWS Secrets Manager`)
          console.log(`💡 Tip: Remove --no-confirm flag to allow overriding existing secrets`)
          throw error
        }

        const override = await confirm({
          message: `Secret '${secretName}' already exists. Override it?`,
          default: false
        })

        if (!override) {
          console.log('⚠️  Operation cancelled')
          return
        }

        const updateCommand = new UpdateSecretCommand({
          SecretId: secretName,
          SecretString: secretValue,
        })

        response = await client.send(updateCommand)

        console.log(`✅ Secret updated successfully in AWS Secrets Manager`)
        console.log(`🔐 Secret Name: ${secretName}`)
        console.log(`🆔 Secret ARN: ${response.ARN}`)
        console.log(`📍 Region: ${region}`)

        if (response.VersionId) {
          console.log(`📌 Version ID: ${response.VersionId}`)
        }
      } else {
        throw error
      }
    }

    const configDir = path.resolve(options.configDir || config.configDirPath || './config')
    const configFile = path.join(configDir, `${environment}.json`)

    try {
      await fs.access(configFile)
    } catch {
      if (options.confirm !== false) {
        const createConfig = await confirm({
          message: `Create local config file for '${environment}' environment?`,
          default: true
        })

        if (createConfig) {
          await fs.mkdir(configDir, { recursive: true })
          await fs.writeFile(
            configFile,
            JSON.stringify({ environment }, null, 2)
          )
          console.log(`📁 Created local config: ${configFile}`)
        }
      }
    }

  } catch (error) {
    if (!(error instanceof ResourceExistsException)) {
      console.error('❌ Failed to create secret:', error.message)

      if (error.name === 'CredentialsProviderError') {
        console.log('\n💡 AWS credentials not found. Please configure:')
        console.log('   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables')
        console.log('   - Or configure AWS CLI: aws configure')
        console.log('   - Or use IAM roles if running on AWS infrastructure')
      }
    }
    throw error
  }
}

export async function deleteSecret(environment, options) {
  debug('Deleting secret for environment:', environment, options)

  const packageName = options.packageName || config.packageName

  if (!packageName) {
    console.error('❌ Package name is required. Use --package-name or set in .mysteriorc')
    throw new Error('Package name not provided')
  }

  const secretName = `${packageName}/${environment}`
  const region = options.region || config.awsRegion || 'us-east-1'

  try {
    const client = new SecretsManagerClient({ region })

    let deleteConfirmed = options.confirm === false ? false : true

    if (options.confirm !== false) {
      deleteConfirmed = await confirm({
        message: `Are you sure you want to delete secret '${secretName}'?`,
        default: false
      })
    }

    if (!deleteConfirmed) {
      console.log('⚠️  Operation cancelled')
      return
    }

    let recoveryWindow
    let forceDelete = options.force

    if (options.days !== undefined) {
      if (options.days < 7 || options.days > 30) {
        console.error('❌ Recovery window must be between 7 and 30 days')
        throw new Error('Invalid recovery window')
      }
      recoveryWindow = options.days
    } else if (!forceDelete) {
      const forceDeletion = await confirm({
        message: 'Force immediate deletion without recovery window?',
        default: false
      })

      if (forceDeletion) {
        forceDelete = true
      } else {
        const days = await input({
          message: 'Recovery window in days (7-30):',
          default: '7',
          validate: (value) => {
            const num = parseInt(value)
            if (isNaN(num) || num < 7 || num > 30) {
              return 'Please enter a number between 7 and 30'
            }
            return true
          }
        })
        recoveryWindow = parseInt(days)
      }
    }

    const deleteParams = {
      SecretId: secretName
    }

    if (forceDelete) {
      deleteParams.ForceDeleteWithoutRecovery = true
    } else {
      deleteParams.RecoveryWindowInDays = recoveryWindow
    }

    const command = new DeleteSecretCommand(deleteParams)
    const response = await client.send(command)

    console.log(`✅ Secret deletion initiated successfully`)
    console.log(`🔐 Secret Name: ${secretName}`)
    console.log(`🆔 Secret ARN: ${response.ARN}`)

    if (response.DeletionDate) {
      const deletionDate = new Date(response.DeletionDate)
      console.log(`📅 Scheduled deletion: ${deletionDate.toISOString()}`)
      console.log(`💡 Tip: Secret can be recovered before this date using AWS Console or CLI`)
    } else {
      console.log(`⚠️  Secret was deleted immediately and cannot be recovered`)
    }

  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      console.error(`❌ Secret '${secretName}' not found in AWS Secrets Manager`)
    } else {
      console.error('❌ Failed to delete secret:', error.message)

      if (error.name === 'CredentialsProviderError') {
        console.log('\n💡 AWS credentials not found. Please configure:')
        console.log('   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables')
        console.log('   - Or configure AWS CLI: aws configure')
        console.log('   - Or use IAM roles if running on AWS infrastructure')
      }
    }
    throw error
  }
}


// ============= NEW REFACTORED COMMANDS =============

/**
 * Unified get command - replaces read, merge, and secrets --get
 */
export async function getConfig(options) {
  debug("Getting configuration with options:", options)

  try {
    const mysterio = new Mysterio({
      env: options.env || process.env.NODE_ENV || "local",
      configDirPath: options.configDir || config.configDirPath || "./config",
      ...config
    })

    let result
    const source = options.source || "merged"

    switch (source) {
      case "local":
        result = await mysterio.getDefaultConfigs()
        break
      case "aws":
        result = await mysterio.getSecrets()
        break
      case "merged":
      case "all":
        result = await mysterio.getMerged()
        break
      default:
        throw new Error(`Invalid source: ${source}. Use "local", "aws", or "merged"`)
    }

    // Format output
    let output
    const format = options.format || "json"

    switch (format) {
      case "json":
        output = JSON.stringify(result, null, 2)
        break
      case "env":
        output = Object.entries(result)
          .map(([key, value]) => {
            const envKey = key.replace(/([A-Z])/g, "_$1").toUpperCase()
            const envValue = typeof value === "object" ? JSON.stringify(value) : value
            return `${envKey}=${envValue}`
          })
          .join("\n")
        break
      default:
        throw new Error(`Invalid format: ${format}. Use "json" or "env"`)
    }

    // Save or output
    if (options.save) {
      await fs.writeFile(options.save, output)
      console.log(`✅ Configuration saved to: ${options.save}`)
    } else {
      console.log(output)
    }

  } catch (error) {
    console.error("❌ Failed to get configuration:", error.message)
    throw error
  }
}

/**
 * Unified set command for updating configuration values
 */
export async function setConfig(key, value, options) {
  debug("Setting configuration:", { key, value, options })

  const env = options.env || process.env.NODE_ENV || "local"
  const target = options.target || "local"
  const configDir = path.resolve(options.configDir || config.configDirPath || "./config")

  try {
    // Handle interactive mode
    if (options.interactive) {
      const configs = {}

      console.log("🔧 Interactive configuration mode (enter empty key to finish)")
      while (true) {
        const k = await input({ message: "Key (empty to finish):" })
        if (!k) break

        const isSecret = target === "aws" || target === "both"
        const v = isSecret
          ? await password({ message: `Value for \"${k}\":` })
          : await input({ message: `Value for \"${k}\":` })

        configs[k] = v
      }

      // Apply all configs
      for (const [k, v] of Object.entries(configs)) {
        await applyConfigValue(k, v, env, target, configDir)
      }
    } else {
      // Single key-value
      if (!key) {
        throw new Error("Key is required")
      }
      await applyConfigValue(key, value, env, target, configDir)
    }

    console.log(`✅ Configuration updated for environment: ${env}`)

  } catch (error) {
    console.error("❌ Failed to set configuration:", error.message)
    throw error
  }
}

async function applyConfigValue(key, value, env, target, configDir) {
  const packageName = config.packageName

  // Update local config
  if (target === "local" || target === "both") {
    const configFile = path.join(configDir, `${env}.json`)

    let configData = {}
    try {
      const existing = await fs.readFile(configFile, "utf-8")
      configData = JSON.parse(existing)
    } catch {
      // File doesnt exist yet
    }

    // Parse value if it looks like JSON
    let parsedValue = value
    try {
      if (value && (value.startsWith("{") || value.startsWith("["))) {
        parsedValue = JSON.parse(value)
      }
    } catch {
      // Keep as string
    }

    configData[key] = parsedValue
    await fs.writeFile(configFile, JSON.stringify(configData, null, 2))
    debug(`Updated local config: ${configFile}`)
  }

  // Update AWS secrets
  if (target === "aws" || target === "both") {
    if (!packageName) {
      throw new Error("Package name required for AWS operations. Set in .mysteriorc")
    }

    const secretName = `${packageName}/${env}`
    const region = config.awsRegion || "us-east-1"
    const client = new SecretsManagerClient({ region })

    try {
      // Get existing secret
      const secretsClient = getSecretsClient({ region })
      const existingSecrets = await secretsClient(secretName)

      // Update with new value
      existingSecrets[key] = value

      const updateCommand = new UpdateSecretCommand({
        SecretId: secretName,
        SecretString: JSON.stringify(existingSecrets)
      })

      await client.send(updateCommand)
      debug(`Updated AWS secret: ${secretName}`)

    } catch (error) {
      if (error.name === "ResourceNotFoundException") {
        // Create new secret if it doesnt exist
        const createCommand = new CreateSecretCommand({
          Name: secretName,
          SecretString: JSON.stringify({ [key]: value }),
          Description: `Secrets for ${packageName} - ${env} environment`
        })

        await client.send(createCommand)
        debug(`Created new AWS secret: ${secretName}`)
      } else {
        throw error
      }
    }
  }
}
/**
 * AWS-specific operations
 */
export async function awsCommand(action, options) {
  const debug = util.debuglog('mysterio-cli')
  const environment = options.env || process.env.NODE_ENV || 'local'
  debug('AWS command:', { action, environment, options })

  const packageName = options.packageName || config.packageName
  if (!packageName) {
    console.error('❌ Package name required. Use --package-name or set in .mysteriorc')
    throw new Error('Package name not provided')
  }

  const configDir = path.resolve(options.configDir || config.configDirPath || './config')
  const region = options.region || config.awsRegion || 'us-east-1'
  const secretName = `${packageName}/${environment}`

  try {
    switch (action) {
      case 'push': {
        // Push local config to AWS
        const configFile = path.join(configDir, `${environment}.json`)

        let configData
        try {
          const content = await fs.readFile(configFile, 'utf-8')
          configData = content
        } catch (error) {
          console.error(`❌ Local config not found: ${configFile}`)
          throw error
        }

        const client = new SecretsManagerClient({ region })

        try {
          const createCommand = new CreateSecretCommand({
            Name: secretName,
            SecretString: configData,
            Description: `Pushed from local config - ${new Date().toISOString()}`
          })

          const response = await client.send(createCommand)
          console.log(`✅ Pushed local config to AWS Secrets Manager`)
          console.log(`🔐 Secret: ${secretName}`)

        } catch (error) {
          if (error instanceof ResourceExistsException) {
            if (!options.override) {
              const shouldOverride = await confirm({
                message: `Secret '${secretName}' exists. Override?`,
                default: false
              })

              if (!shouldOverride) {
                console.log('⚠️  Operation cancelled')
                return
              }
            }

            const updateCommand = new UpdateSecretCommand({
              SecretId: secretName,
              SecretString: configData
            })

            await client.send(updateCommand)
            console.log(`✅ Updated existing secret in AWS`)
          } else {
            throw error
          }
        }
        break
      }

      case 'pull': {
        // Pull AWS secrets to local config
        try {
          const secretsClient = getSecretsClient({ region })
          const secrets = await secretsClient(secretName)

          const configFile = path.join(configDir, `${environment}.json`)

          if (!options.override) {
            try {
              await fs.access(configFile)
              const shouldOverride = await confirm({
                message: `Local config exists for '${environment}'. Override?`,
                default: false
              })

              if (!shouldOverride) {
                console.log('⚠️  Operation cancelled')
                return
              }
            } catch {
              // File doesn't exist, proceed
            }
          }

          await fs.writeFile(configFile, JSON.stringify(secrets, null, 2))
          console.log(`✅ Pulled AWS secrets to local config`)
          console.log(`📁 Saved to: ${configFile}`)

        } catch (error) {
          console.error(`❌ Failed to pull secrets from AWS:`, error.message)
          throw error
        }
        break
      }

      case 'sync': {
        // Bidirectional sync
        const prefer = options.prefer || 'local'

        console.log(`🔄 Syncing with preference: ${prefer}`)

        // Get both configs
        const configFile = path.join(configDir, `${environment}.json`)
        let localConfig = {}
        let awsConfig = {}

        try {
          const content = await fs.readFile(configFile, 'utf-8')
          localConfig = JSON.parse(content)
        } catch {
          console.log('📝 No local config found')
        }

        try {
          const secretsClient = getSecretsClient({ region })
          awsConfig = await secretsClient(secretName)
        } catch {
          console.log('☁️  No AWS secret found')
        }

        // Merge with preference
        const merged = prefer === 'local'
          ? { ...awsConfig, ...localConfig }
          : { ...localConfig, ...awsConfig }

        // Write back to both
        await fs.writeFile(configFile, JSON.stringify(merged, null, 2))

        const client = new SecretsManagerClient({ region })
        try {
          const updateCommand = new UpdateSecretCommand({
            SecretId: secretName,
            SecretString: JSON.stringify(merged)
          })
          await client.send(updateCommand)
        } catch (error) {
          if (error.name === 'ResourceNotFoundException') {
            const createCommand = new CreateSecretCommand({
              Name: secretName,
              SecretString: JSON.stringify(merged),
              Description: `Synced - ${new Date().toISOString()}`
            })
            await client.send(createCommand)
          } else {
            throw error
          }
        }

        console.log(`✅ Synced configuration`)
        console.log(`📁 Local: ${configFile}`)
        console.log(`☁️  AWS: ${secretName}`)
        break
      }

      case 'delete': {
        // Delete from AWS (existing deleteSecret logic)
        await deleteSecret(environment, options)
        break
      }

      default:
        throw new Error(`Unknown AWS action: ${action}`)
    }
  } catch (error) {
    console.error('❌ AWS operation failed:', error.message)

    if (error.name === 'CredentialsProviderError') {
      console.log('\n💡 AWS credentials not found. Please configure:')
      console.log('   - Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY')
      console.log('   - Or run: aws configure')
    }

    throw error
  }
}

/**
 * Refactored env command
 */
export async function envCommand(action, name, options) {
  const debug = util.debuglog('mysterio-cli')
  debug('Environment command:', { action, name, options })

  const configDir = path.resolve(options.configDir || config.configDirPath || './config')

  try {
    switch (action) {
      case 'create': {
        if (!name) {
          name = await input({ message: 'Environment name:' })
        }

        const configFile = path.join(configDir, `${name}.json`)

        // Check if already exists
        try {
          await fs.access(configFile)
          console.error(`❌ Environment '${name}' already exists`)
          return
        } catch {
          // Doesn't exist, proceed
        }

        let configData = { environment: name }

        // Use template if specified
        if (options.from) {
          const templateFile = path.join(configDir, `${options.from}.json`)
          try {
            const templateContent = await fs.readFile(templateFile, 'utf-8')
            configData = { ...JSON.parse(templateContent), environment: name }
            console.log(`📋 Using template from: ${options.from}`)
          } catch {
            console.error(`❌ Template environment '${options.from}' not found`)
            throw new Error('Template not found')
          }
        }

        await fs.mkdir(configDir, { recursive: true })
        await fs.writeFile(configFile, JSON.stringify(configData, null, 2))
        console.log(`✅ Created environment: ${name}`)

        // Create in AWS if requested
        if (options.withAws && config.packageName) {
          await awsCommand('push', { env: name, override: false })
        }
        break
      }

      case 'list': {
        const files = await fs.readdir(configDir)
        const envs = files
          .filter(f => f.endsWith('.json') && f !== 'default.json')
          .map(f => f.replace('.json', ''))

        console.log('📋 Environments:')

        for (const env of envs) {
          let status = `  📁 ${env}`

          if (options.showAws && config.packageName) {
            const secretName = `${config.packageName}/${env}`
            try {
              const region = config.awsRegion || 'us-east-1'
              const secretsClient = getSecretsClient({ region })
              await secretsClient(secretName)
              status += ' ☁️  [AWS ✓]'
            } catch {
              status += ' ☁️  [AWS ✗]'
            }
          }

          console.log(status)
        }
        break
      }

      case 'delete': {
        if (!name) {
          name = await input({ message: 'Environment to delete:' })
        }

        const confirmed = await confirm({
          message: `Delete environment '${name}'?`,
          default: false
        })

        if (!confirmed) {
          console.log('⚠️  Cancelled')
          return
        }

        const configFile = path.join(configDir, `${name}.json`)
        await fs.unlink(configFile)
        console.log(`✅ Deleted local environment: ${name}`)

        // Delete from AWS if requested
        if (options.withAws && config.packageName) {
          await awsCommand('delete', {
            env: name,
            force: options.force,
            days: options.days
          })
        }
        break
      }

      default:
        throw new Error(`Unknown action: ${action}. Use 'create', 'list', or 'delete'`)
    }
  } catch (error) {
    console.error('❌ Environment operation failed:', error.message)
    throw error
  }
}