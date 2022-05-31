import { access } from 'fs'
import { resolve } from 'path'
import { promisify } from 'util'
import { spawn } from 'child_process'
import { lockFileMap } from './config'

const cwd = process.cwd()
const args = process.argv.slice(2)
const accessPromise = promisify(access)

export default async function n() {
  const manager = await getManager()
  const command = `${manager} ${args.join(' ')}`
  console.log(command)
  spawn(command, { shell: true, stdio: 'inherit', cwd })
}

async function getManager(dfManager = 'npm') {
  for await (const [manager, lockFile] of lockFileMap) {
    try {
      await accessPromise(resolve(cwd, lockFile))
      return manager
    } catch (_) {}
  }
  return dfManager
}
