export type ManagerName = 'npm' | 'pnpm' | 'yarn'

export type Manager = {
  name: ManagerName
  lockFile: string
}

const npm: Manager = {
  name: 'npm',
  lockFile: 'package-lock.json',
}
const pnpm: Manager = {
  name: 'pnpm',
  lockFile: 'pnpm-lock.yaml',
}
const yarn: Manager = {
  name: 'yarn',
  lockFile: 'yarn.lock',
}
export const managers = [npm, pnpm, yarn]
