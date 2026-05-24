import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoDir = fileURLToPath(new URL('..', import.meta.url))
const cliPath = join(repoDir, 'bin/n')
const managerNames = ['npm', 'pnpm', 'yarn', 'bun']

test('uses packageManager from package.json before lockfiles', async t => {
  const fixture = await createFixture(t)

  await writePackageJson(fixture.projectDir, { packageManager: 'pnpm@10.0.0' })
  await writeFile(join(fixture.projectDir, 'package-lock.json'), '', 'utf8')

  const result = await runNpmm(fixture, ['install', '--frozen-lockfile'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^pnpm install --frozen-lockfile$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'pnpm',
      args: ['install', '--frozen-lockfile'],
    },
  ])
})

test('detects the package manager from a single lockfile', async t => {
  const fixture = await createFixture(t)

  await writePackageJson(fixture.projectDir, {})
  await writeFile(join(fixture.projectDir, 'yarn.lock'), '', 'utf8')

  const result = await runNpmm(fixture, ['run', 'build'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^yarn run build$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'yarn',
      args: ['run', 'build'],
    },
  ])
})

test('uses bun from packageManager in package.json', async t => {
  const fixture = await createFixture(t)

  await writePackageJson(fixture.projectDir, { packageManager: 'bun@1.2.0' })
  await writeFile(join(fixture.projectDir, 'package-lock.json'), '', 'utf8')

  const result = await runNpmm(fixture, ['ci'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^bun ci$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'bun',
      args: ['ci'],
    },
  ])
})

test('detects bun from bun.lock', async t => {
  const fixture = await createFixture(t)

  await writeFile(join(fixture.projectDir, 'bun.lock'), '', 'utf8')

  const result = await runNpmm(fixture, ['add', 'vite'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^bun add vite$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'bun',
      args: ['add', 'vite'],
    },
  ])
})

test('treats bun.lock and bun.lockb as one bun signal', async t => {
  const fixture = await createFixture(t)

  await writeFile(join(fixture.projectDir, 'bun.lock'), '', 'utf8')
  await writeFile(join(fixture.projectDir, 'bun.lockb'), '', 'utf8')

  const result = await runNpmm(fixture, ['install'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^bun install$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'bun',
      args: ['install'],
    },
  ])
})

test('walks up from nested directories to find the nearest project signal', async t => {
  const fixture = await createFixture(t)
  const nestedDir = join(fixture.projectDir, 'packages', 'app', 'src')

  await mkdir(nestedDir, { recursive: true })
  await writeFile(join(fixture.projectDir, 'pnpm-lock.yaml'), '', 'utf8')

  const result = await runNpmm(fixture, ['add', 'typescript'], {
    cwd: nestedDir,
  })

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^pnpm add typescript$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'pnpm',
      args: ['add', 'typescript'],
    },
  ])
})

test('defaults to npm when no project signal is found', async t => {
  const fixture = await createFixture(t)

  const result = await runNpmm(fixture, ['version'])

  assert.equal(result.code, 0)
  assert.match(result.stdout, /^npm version$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'npm',
      args: ['version'],
    },
  ])
})

test('fails in non-interactive mode when multiple lockfiles are present', async t => {
  const fixture = await createFixture(t)

  await writeFile(join(fixture.projectDir, 'package-lock.json'), '', 'utf8')
  await writeFile(join(fixture.projectDir, 'pnpm-lock.yaml'), '', 'utf8')

  const result = await runNpmm(fixture, ['install'])

  assert.equal(result.code, 1)
  assert.match(result.stderr, /multiple lockfiles found/)
  assert.match(result.stderr, /Set packageManager in package\.json/)
  assert.deepEqual(await readCalls(fixture), [])
})

test('passes through the selected package manager exit code', async t => {
  const fixture = await createFixture(t)

  await writeFile(join(fixture.projectDir, 'pnpm-lock.yaml'), '', 'utf8')

  const result = await runNpmm(fixture, ['run', 'lint'], {
    env: {
      NPMM_TEST_EXIT_CODE: '23',
    },
  })

  assert.equal(result.code, 23)
  assert.match(result.stdout, /^pnpm run lint$/m)
  assert.deepEqual(await readCalls(fixture), [
    {
      manager: 'pnpm',
      args: ['run', 'lint'],
    },
  ])
})

test('reports unsupported packageManager values', async t => {
  const fixture = await createFixture(t)

  await writePackageJson(fixture.projectDir, { packageManager: 'deno@2.0.0' })

  const result = await runNpmm(fixture, ['install'])

  assert.equal(result.code, 1)
  assert.match(result.stderr, /packageManager "deno@2\.0\.0" is not supported/)
  assert.match(result.stderr, /Supported managers: npm, pnpm, yarn, bun/)
  assert.deepEqual(await readCalls(fixture), [])
})

async function createFixture(t) {
  const rootDir = await mkdtemp(join(tmpdir(), 'npmm-test-'))
  const binDir = join(rootDir, 'bin')
  const projectDir = join(rootDir, 'project')
  const logFile = join(rootDir, 'calls.log')

  await mkdir(binDir)
  await mkdir(projectDir)
  await createFakeManagers(binDir)

  t.after(async () => {
    await rm(rootDir, { recursive: true, force: true })
  })

  return {
    binDir,
    projectDir,
    logFile,
  }
}

async function createFakeManagers(binDir) {
  for (const manager of managerNames) {
    const scriptPath = join(binDir, manager)

    // Put fake package managers first in PATH so each test exercises the real CLI spawn path.
    await writeFile(
      scriptPath,
      `#!/usr/bin/env node
const { appendFileSync } = require('node:fs')
const { basename } = require('node:path')

const manager = basename(process.argv[1])
appendFileSync(
  process.env.NPMM_TEST_LOG,
  JSON.stringify({ manager, args: process.argv.slice(2) }) + '\\n'
)

if (process.env.NPMM_TEST_EXIT_CODE) {
  process.exit(Number(process.env.NPMM_TEST_EXIT_CODE))
}
`,
      'utf8',
    )

    await chmod(scriptPath, 0o755)
  }
}

function runNpmm(fixture, args, options = {}) {
  const childEnv = {
    ...process.env,
    PATH: `${fixture.binDir}${delimiter}${process.env.PATH ?? ''}`,
    NPMM_TEST_LOG: fixture.logFile,
    ...options.env,
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: options.cwd ?? fixture.projectDir,
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk
    })
    child.stderr.on('data', chunk => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolve({
        code,
        signal,
        stdout,
        stderr,
      })
    })
  })
}

async function readCalls(fixture) {
  try {
    const content = await readFile(fixture.logFile, 'utf8')

    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line))
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

function writePackageJson(dir, value) {
  return writeFile(
    join(dir, 'package.json'),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  )
}
