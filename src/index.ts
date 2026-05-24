import { spawn } from 'child_process'
import { isCancel, select } from '@clack/prompts'
import { access, readFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { managers, type ManagerName } from './config'

const cwd = process.cwd()
const args = process.argv.slice(2)

type LockFileMatch = {
  manager: ManagerName
  lockFile: string
}

type ProjectInfo = {
  dir: string
  packageManager?: ManagerName
  lockFiles: LockFileMatch[]
}

export default async function n() {
  const manager = await getManager()
  console.log([manager, ...args].join(' '))
  await spawnManager(manager)
}

async function getManager(dfManager: ManagerName = 'npm'): Promise<ManagerName> {
  const project = await findNearestProject(cwd)

  if (!project) {
    return dfManager
  }

  if (project.packageManager) {
    return project.packageManager
  }

  if (project.lockFiles.length === 1) {
    return project.lockFiles[0].manager
  }

  return selectManager(project)
}

async function findNearestProject(startDir: string): Promise<ProjectInfo | undefined> {
  let dir = startDir

  // 从当前目录向上寻找最近的包管理器信号，兼容在 monorepo 子目录里执行 n 的场景。
  while (true) {
    const packageManager = await readPackageManager(dir)
    const lockFiles = await readLockFiles(dir)

    if (packageManager || lockFiles.length > 0) {
      return {
        dir,
        packageManager,
        lockFiles,
      }
    }

    const parent = dirname(dir)
    if (parent === dir) {
      return undefined
    }

    dir = parent
  }
}

async function readPackageManager(dir: string): Promise<ManagerName | undefined> {
  try {
    const packageJson = JSON.parse(await readFile(resolve(dir, 'package.json'), 'utf8'))
    const packageManager = packageJson.packageManager

    if (typeof packageManager !== 'string') {
      return undefined
    }

    const manager = packageManager.split('@')[0]
    if (isManagerName(manager)) {
      return manager
    }

    throw new Error(
      `npmm: packageManager "${packageManager}" is not supported. Supported managers: npm, pnpm, yarn.`
    )
  } catch (error) {
    if (isNotFoundError(error)) {
      return undefined
    }

    throw error
  }
}

async function readLockFiles(dir: string): Promise<LockFileMatch[]> {
  const matches: LockFileMatch[] = []

  for (const manager of managers) {
    try {
      await access(resolve(dir, manager.lockFile))
      matches.push({
        manager: manager.name,
        lockFile: manager.lockFile,
      })
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error
      }
    }
  }

  return matches
}

async function selectManager(project: ProjectInfo): Promise<ManagerName> {
  if (!process.stdin.isTTY) {
    throw new Error(
      `npmm: multiple lockfiles found in ${project.dir}. Set packageManager in package.json for non-interactive usage.`
    )
  }

  // 选择只影响本次执行，不写入 package.json，保持 npmm 作为透明 alias 的职责边界。
  const selected = await select({
    message: `Multiple lockfiles found in ${project.dir}. Select a package manager:`,
    options: project.lockFiles.map(({ manager, lockFile }) => ({
      value: manager,
      label: manager,
      hint: lockFile,
    })),
  })

  if (isCancel(selected)) {
    throw new Error('npmm: selection canceled.')
  }

  return selected
}

function spawnManager(manager: ManagerName): Promise<void> {
  return new Promise((resolveChild, rejectChild) => {
    let settled = false
    const child = spawn(manager, args, { stdio: 'inherit', cwd })

    child.on('error', (error) => {
      if (settled) {
        return
      }
      settled = true

      if (isNotFoundError(error)) {
        rejectChild(new Error(`npmm: command not found: ${manager}`))
        return
      }

      rejectChild(error)
    })

    child.on('exit', (code) => {
      if (settled) {
        return
      }
      settled = true

      // 子进程已经负责输出失败原因；npmm 只透传退出码，避免重复报错。
      process.exitCode = code ?? 1
      resolveChild()
    })
  })
}

function isManagerName(value: string): value is ManagerName {
  return managers.some((manager) => manager.name === value)
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT'
}
