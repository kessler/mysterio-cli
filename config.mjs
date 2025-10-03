import rc from 'rc'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let defaultPackageName = null
try {
  const packageJsonPath = path.join(process.cwd(), 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
  defaultPackageName = packageJson.name
} catch (error) {
  // Ignore if package.json doesn't exist or can't be read
}

export const config = rc('mysterio-cli', {
  configDirPath: './config',
  localRCPath: '.mysteriorc',
  env: process.env.NODE_ENV || 'local',
  packageName: defaultPackageName,
  awsParams: {
    region: process.env.AWS_REGION || 'us-east-1'
  },
  awsRegion: process.env.AWS_REGION || 'us-east-1',
  debug: process.env.DEBUG === 'mysterio-cli'
})