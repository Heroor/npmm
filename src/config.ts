export type ManagerName = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type Manager = {
  name: ManagerName
  lockFiles: string[]
}

const npm: Manager = {
  name: 'npm',
  lockFiles: ['package-lock.json'],
}
const pnpm: Manager = {
  name: 'pnpm',
  lockFiles: ['pnpm-lock.yaml'],
}
const yarn: Manager = {
  name: 'yarn',
  lockFiles: ['yarn.lock'],
}
const bun: Manager = {
  name: 'bun',
  lockFiles: ['bun.lock', 'bun.lockb'],
}
export const managers = [npm, pnpm, yarn, bun]
