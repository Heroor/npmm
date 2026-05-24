# npmm

An npm / pnpm / yarn / bun command alias. Run `n <args>` or `npmm <args>`, and npmm will detect the package manager for the current project, then forward all arguments to that command.

## Features

- Supports `npm`, `pnpm`, `yarn`, and `bun`
- Provides both `n` and `npmm` command aliases
- Prefers the `packageManager` field in `package.json`
- Falls back to lockfile detection when `packageManager` is not set
- Searches upward from the current directory, which works well in monorepo subdirectories
- Prompts for a package manager when multiple lockfiles are found

## Installation

```bash
npm install -g @heroor/npmm
```

You can also install it globally with your preferred package manager:

```bash
pnpm add -g @heroor/npmm
yarn global add @heroor/npmm
bun install --global @heroor/npmm
```

> The `n` command name may conflict with other tools. If you already have another `n` command installed, use `npmm` instead.

## Usage

Replace your package manager command with `n` inside a project:

```bash
n install
n run dev
n run build
n add react
n remove lodash
```

You can also use the full command name:

```bash
npmm install
npmm run dev
```

npmm prints the command it is about to run, for example:

```bash
pnpm install
```

Then it starts the detected package manager and forwards the original arguments.

## Package Manager Detection

npmm starts from the current working directory and walks up parent directories until it finds the nearest `package.json` or supported lockfile.

Detection priority:

1. If `package.json` has a `packageManager` field, npmm uses that manager.
2. If lockfiles point to exactly one package manager, npmm uses that manager.
3. If lockfiles point to multiple package managers in an interactive terminal, npmm prompts you to choose one.
4. If no project signal is found, npmm defaults to `npm`.

Supported lockfiles:

| Package manager | Lockfile            |
| --------------- | ------------------- |
| `npm`           | `package-lock.json` |
| `pnpm`          | `pnpm-lock.yaml`    |
| `yarn`          | `yarn.lock`         |
| `bun`           | `bun.lock`, `bun.lockb` |

For stable CI and script usage, declare the package manager in `package.json`:

```json
{
  "packageManager": "pnpm@10.0.0"
}
```

## Non-Interactive Environments

If a project has lockfiles for multiple package managers and no `packageManager` field, npmm fails in non-interactive environments. Add `packageManager` to `package.json` to make CI, pre-commit hooks, and scripts deterministic.

## Bun Support

Bun is supported as a package manager when a project declares `packageManager: "bun@..."`, has `bun.lock`, or has the legacy `bun.lockb` lockfile.

npmm forwards commands to `bun` without translating arguments. Command and flag compatibility follows Bun's CLI behavior, so `n run dev` becomes `bun run dev` and runs through Bun.

## Development

```bash
pnpm install
pnpm test
pnpm run dev
pnpm run typecheck
pnpm run build
```

Source files live in `src/`, and build output is written to `dist/`. The `prepack` script runs the build before publishing.

## License

MIT
