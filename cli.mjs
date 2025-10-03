#!/usr/bin/env node

import util from 'node:util'
import { Command } from 'commander'
import {
  initMysterio,
  getConfig,
  setConfig,
  awsCommand,
  envCommand
} from './index.mjs'
import { config } from './config.mjs'

const debug = util.debuglog('mysterio-cli')
const program = new Command()

program
  .name('mysterio')
  .description('CLI tool for Mysterio - configuration and secrets management')
  .version('1.0.0')

// Core command 1: Initialize project
program.command('init')
  .description('Initialize Mysterio for a new project')
  .option('-p, --package-name <name>', 'Package name for the project')
  .option('-d, --config-dir <path>', 'Configuration directory path', './config')
  .option('-e, --environments <envs...>', 'Initial environments to create', ['local', 'development', 'production'])
  .option('--aws-region <region>', 'AWS region for secrets manager', 'us-east-1')
  .action(initMysterio)

// Core command 2: Get configuration
program.command('get')
  .description('Get configuration from any source')
  .option('-e, --env <environment>', 'Environment', process.env.NODE_ENV || 'local')
  .option('-s, --source <type>', 'Source: local|aws|merged (default: merged)')
  .option('-f, --format <format>', 'Output format: json|env (default: json)')
  .option('-d, --config-dir <path>', 'Configuration directory', './config')
  .option('--save <file>', 'Save output to file')
  .action(getConfig)

// Core command 3: Set configuration
program.command('set <key> [value]')
  .description('Set configuration values')
  .option('-e, --env <environment>', 'Target environment', process.env.NODE_ENV || 'local')
  .option('-t, --target <type>', 'Target: local|aws|both (default: local)')
  .option('-d, --config-dir <path>', 'Configuration directory', './config')
  .option('-i, --interactive', 'Interactive mode for multiple values')
  .action(setConfig)

// Core command 4: Environment management
program.command('env <action> [name]')
  .description('Manage environments (create|list|delete)')
  .option('-d, --config-dir <path>', 'Configuration directory path', './config')
  .option('--from <env>', 'Use existing environment as template')
  .option('--with-aws', 'Also manage in AWS Secrets Manager', false)
  .option('--show-aws', 'Show AWS status when listing', false)
  .option('--force', 'Force deletion without recovery (AWS)', false)
  .option('--days <days>', 'Recovery window days for AWS (7-30)', parseInt)
  .action(envCommand)

// Core command 5: AWS operations
program.command('aws <action>')
  .description('AWS Secrets Manager operations (push|pull|sync|delete)')
  .option('-e, --env <environment>', 'Target environment', process.env.NODE_ENV || 'local')
  .option('-p, --package-name <name>', 'Package name')
  .option('-r, --region <region>', 'AWS region', 'us-east-1')
  .option('-d, --config-dir <path>', 'Configuration directory', './config')
  .option('--override', 'Override existing without prompting')
  .option('--prefer <source>', 'For sync: prefer local|aws (default: local)')
  .option('--force', 'For delete: immediate deletion without recovery')
  .option('--days <days>', 'For delete: recovery window days (7-30)', parseInt)
  .action(awsCommand)

program.parse()