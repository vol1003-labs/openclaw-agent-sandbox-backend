# Design: `createFsBridge` (reuse remote-shell bridge) + release-asset — v0.2.0

- **Date:** 2026-07-01
- **Status:** Approved (brainstorming complete → next: writing-plans)
- **OpenClaw contract verified against:** `openclaw@2026.6.10`

## Goal

Add `createFsBridge` to the sandbox backend handle so OpenClaw's file tools
(read/write/edit/apply_patch) operate **inside the sandbox Pod** via `pods/exec`,
instead of falling back to the host-workspace bridge. Then ship it as an
installable GitHub Release `.tgz` asset at **v0.2.0** (npm publish is blocked for
a few days; the release asset is the npm-free distribution path).

## Problem (the gap)

With `sandbox.mode:"all"` and a handle that has **no** `createFsBridge`, OpenClaw
falls back to the default `createSandboxFsBridge`, which maps container paths to
the **bind-mounted host workspace** (`sandbox.workspaceDir`). For our *remote*
Pod backend that host dir is the filesystem of the host process running OpenClaw,
not the sandbox. So file tools silently decouple from exec: an edit lands
"locally" while exec inside the sandbox can't see it.

Call site (openclaw `sandbox-*.js` L1340):
```js
sandboxContext.fsBridge = backend.createFsBridge?.({ sandbox: sandboxContext })
  ?? createSandboxFsBridge({ sandbox: sandboxContext });
```

## Key decision — reuse OpenClaw's own remote-shell bridge

**Do NOT hand-roll a POSIX-shell fs bridge.** Reuse OpenClaw's
`createRemoteShellSandboxFsBridge` via the stable public export
`openclaw/plugin-sdk/sandbox`, wired to the handle's existing `runShellCommand`.

### Evidence gathered during brainstorming

- **The docker backend is NOT a template for us.** `createDockerSandboxBackendHandle`
  (browser-bridges L51-80) sets **no** `createFsBridge` → it falls back to the
  host-mount default. That works for Docker because the container bind-mounts the
  host workspace (host file == container file). Our Pod does not share a
  filesystem with the host → we are in the **SSH / RemoteShell** camp, not the
  Docker camp.
- **`RemoteShellSandboxFsBridge` is transport-agnostic.** Its class body
  (browser-bridges L695-1057) has **zero** references to `ssh`/`session`/`sftp`/
  `scp`/`dispose`. It uses only `runtime.runRemoteShellScript`,
  `runtime.remoteWorkspaceDir`, `runtime.remoteAgentWorkspaceDir`, and the
  per-call `sandbox` context. The "SSH" in its doc comment reflects its only
  current consumer, not a coupling. "RemoteShell" = "runs shell remotely".
- **Positional-arg convention matches the SSH backend — the party that actually
  feeds the bridge.** The bridge scripts (`$1`/`$2`/`"$@"`) are executed by
  `runRemoteShellScript`; its implementation (SSH backend, browser-bridges
  L1945-1962) builds `/bin/sh -c "$script" openclaw-sandbox-fs <args...>`, so
  `$0=label` and `$1=args[0]`. Our `buildRunShellInPodCommand` produces
  `/bin/sh -c script agent-sandbox ...args` — the **same structure** — so our
  `runShellCommand` is a drop-in for `runRemoteShellScript`. (Docker's
  `runDockerSandboxShellCommand` happens to use the same convention, but Docker
  never feeds the bridge, so that match is incidental and not part of the proof.)
- **What we get for free (and stays in sync with upstream):** mount-boundary
  enforcement (paths can't escape allowed roots), read-only protected skill dirs
  (`skills`, `.agents/skills`, `.openclaw/sandbox-skills/skills`), symlink
  canonicalization (`readlink -f`), hardlink rejection (TOCTOU defense), and
  behavioral parity with the SSH backend (identical defaults + `stat` format).
- **Semantics the naive plan would have diverged on:** upstream defaults
  `writeFile` `mkdir` to **on** (`mkdir !== false`) and `remove` `force` to **on**
  (`force !== false`); `stat` uses `stat -c "%F|%s|%y"` on a canonicalized path.

### Contract (from `openclaw/plugin-sdk/sandbox`)

```ts
type RemoteShellSandboxHandle = {
  remoteWorkspaceDir: string;
  remoteAgentWorkspaceDir: string;
  runRemoteShellScript(params: SandboxBackendCommandParams): Promise<SandboxBackendCommandResult>;
};

declare function createRemoteShellSandboxFsBridge(params: {
  sandbox: SandboxFsBridgeContext;
  runtime: RemoteShellSandboxHandle;
}): SandboxFsBridge;

// existing primitive we build on (src/backend.ts):
type SandboxBackendCommandParams = { script: string; args?: string[]; stdin?: Buffer | string; allowFailure?: boolean; signal?: AbortSignal };
type SandboxBackendCommandResult = { stdout: Buffer; stderr: Buffer; code: number };
```

Our handle's `runShellCommand(params: SandboxBackendCommandParams): Promise<SandboxBackendCommandResult>`
is signature-identical to `runRemoteShellScript`, so it drops straight in.

## Architecture

`createFsBridge` closes over the handle's own `runShellCommand` and builds a
minimal `RemoteShellSandboxHandle` adapter:

- `remoteWorkspaceDir` = `remoteAgentWorkspaceDir` = **`cfg.workdir`** (our config
  exposes a single `workdir`, default `/workspace`; no separate agent workspace).
  The SSH backend resolves both once per runtime (`resolveSshRuntimePaths`, giving
  distinct `/workspace` and `/agent` dirs) rather than per fs call; our backend has
  a single workspace, so we pass `cfg.workdir` to both — same "fixed per backend,
  not per call" shape.
- `runRemoteShellScript` = `runShellCommand`.

`context.backend` is intentionally ignored (it may be unpopulated by the host);
the closure over `runShellCommand` is strictly correct.

## File structure

- **Create `src/fs-bridge.ts`** — `createAgentSandboxFsBridge({ run, workdir, sandbox })`:
  builds the runtime adapter and returns `createRemoteShellSandboxFsBridge({ sandbox, runtime })`.
  Type-only imports of `RemoteShellSandboxHandle`, `SandboxFsBridge`,
  `SandboxFsBridgeContext`, `SandboxBackendCommandParams`,
  `SandboxBackendCommandResult` from `openclaw/plugin-sdk/sandbox`; value import of
  `createRemoteShellSandboxFsBridge`. ESM `.js` suffixes on local imports.
- **Modify `src/backend.ts`** — extract the inline `runShellCommand` method into a
  hoisted local `const`; add
  `createFsBridge: ({ sandbox }) => createAgentSandboxFsBridge({ run: runShellCommand, workdir: cfg.workdir, sandbox })`.
- **Create `src/fs-bridge.test.ts`** / **modify `src/backend.test.ts`** — see below.
- **Modify `.github/workflows/release.yml`** — `npm pack` + attach `.tgz`.
- **Modify `package.json`** (0.1.0 → 0.2.0), **`CHANGELOG.md`** (`## [0.2.0]`),
  **`README.md`** (npm-free install path + runner requirement note).

## Test strategy

We do **not** re-test OpenClaw's bridge behavior (that is upstream's contract).
We test **our wiring only**, with a mocked `run`:

- `handle.createFsBridge` is a function returning a bridge with all 7 methods
  (`resolvePath`, `readFile`, `writeFile`, `mkdirp`, `remove`, `rename`, `stat`).
- `resolvePath({ filePath: "a/b.txt" })` returns a `containerPath` under
  `/workspace` (synchronous; exercises the real bridge through the adapter with no
  `run` call).
- One op (e.g. `readFile`) invokes the injected `run` and propagates its `stdout`
  — a light smoke test that the adapter is actually connected. We assert only that
  `run` was called and the result flows through; we do **not** couple to the exact
  upstream script/arg layout.

`resolvePath`/`getMounts` may run host-FS existence checks for protected skill
dirs; on the dev machine those paths don't exist and are simply filtered out, so
the tests need no real Pod.

## Release / distribution

- `release.yml`: add a **Pack** step after **Build** (`file="$(npm pack --silent)"`
  → `$GITHUB_OUTPUT`), and attach it in **Create GitHub Release**:
  `gh release create "$tag" "${{ steps.pack.outputs.file }}" "${args[@]}"`.
  (`files: ["dist", ...]` + `prepack: npm run build` ⇒ the tarball contains
  `dist/fs-bridge.js` + `dist/index.js`.)
- `package.json` version → **0.2.0** (the release job's "verify version matches
  tag" step requires this before tagging).
- `CHANGELOG.md`: add `## [0.2.0]` between `## [Unreleased]` and `## [0.1.0]` (the
  release job extracts notes for the tag version via `awk`; the section is
  **required** or the job fails).
- `README.md`: document the interim `openclaw plugins install ./…-0.2.0.tgz`
  path, note that `git:`/`github:` specs are unsupported (`dist/` is gitignored),
  and note the runner requirement (python3 + GNU coreutils).

## Operational flow

- One-shot **v0.2.0** (feature + release-asset shipped together).
- Branch **`feat/fs-bridge`** off **`origin/main`** (`2821491`, which already
  contains the README fix merged as PR #8). The local `doc/fix-readme` branch is
  now redundant.
- Task-by-task **TDD** (RED → GREEN → `npm run check && npm run typecheck && npm test`
  green → commit).
- **PR → merge → tag `v0.2.0`** on the merge commit → push tag (main is PR-only;
  the version bump must be merged before tagging so the release job's version
  check passes). The `v*` ruleset blocks force-push/delete but permits new-tag
  creation.
- **Verification depth:** mocked unit tests only. In-Pod runtime behavior
  (`stat`, path semantics, writes) is verified live in a separate session when the
  plugin is deployed.

## Constraints & open points

- **New runtime constraint (must document):** the sandbox runner must have
  **`python3`** (mutations run `python3 /dev/fd/3 …`; candidates include
  `/usr/bin/python3`, `/usr/local/bin/python3`, `/bin/python3`) and **GNU `stat`**
  (`stat -c "%F|%s|%y"`). Any **Linux runner with python3 + GNU coreutils**
  satisfies this. If the base image changes to one without python3 (e.g. plain
  Alpine/BusyBox), the fs bridge's read/write/mkdirp/remove/rename break
  (stat/exists still work) — re-verify before such a change.
- **O2 — `context.backend` unused:** intentional; the bridge closes over the
  handle's own `runShellCommand`.
- **O4 — buffered, no streaming:** all ops go through the buffered
  `runBufferedWrapper`, so large/binary files are held fully in memory. Acceptable
  for typical source files; noted as a v1 limitation. (Unchanged by the reuse
  decision — the upstream bridge still runs through our buffered wrapper.)
- **O1/O3/O5 resolved by upstream:** stat portability within Linux, path
  semantics (container-absolute vs workspace-relative), and exact write bytes are
  all handled by `createRemoteShellSandboxFsBridge`.
- **Compat pinned (no change):** `peerDependencies.openclaw` and
  `openclaw.compat.pluginApi` stay `>=2026.6.10`.

## Definition of Done

1. `npm run check && npm run typecheck && npm test` all green; new `fs-bridge`
   suite passes.
2. `handle.createFsBridge` returns a 7-method bridge; wiring tests pass.
3. `npm pack` produces `openclaw-agent-sandbox-backend-0.2.0.tgz` containing
   `dist/fs-bridge.js` + `dist/index.js`.
4. Pushing tag `v0.2.0` runs the workflow and the GitHub Release carries the
   `.tgz` asset (`gh release view v0.2.0` lists it).
5. The public release asset resolves at its tag URL.
