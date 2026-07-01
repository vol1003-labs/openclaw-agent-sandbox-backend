# createFsBridge (reuse remote-shell bridge) + release-asset v0.2.0 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `createFsBridge` to the sandbox backend handle by reusing OpenClaw's own `createRemoteShellSandboxFsBridge`, then ship it as a GitHub Release `.tgz` asset at v0.2.0.

**Architecture:** Our K8s Pod backend is remote and shares no filesystem with the host — the same situation as OpenClaw's SSH backend. So `createFsBridge` reuses `createRemoteShellSandboxFsBridge` (a transport-agnostic, hardened bridge) via a ~10-line adapter that maps the bridge's minimal `RemoteShellSandboxHandle` contract onto the handle's existing `runShellCommand`. No fs ops are hand-rolled.

**Tech Stack:** TypeScript (ESM, `type: module`), tsc → `dist/`, Biome (lint/format), Vitest (unit tests), GitHub Actions tag-triggered release. `@kubernetes/client-node` runtime dep (unchanged).

## Global Constraints

- **Contract is fixed by OpenClaw** — reuse `createRemoteShellSandboxFsBridge` from `openclaw/plugin-sdk/sandbox`; do not re-implement fs ops or change the `SandboxFsBridge` shape.
- **Registration id ≡ handle.id ≡ `"agent-sandbox"`** — do not touch (existing invariant).
- **Injection safety is inherited** — the reused bridge passes all caller paths as positional args to `runShellCommand`; our adapter must not interpolate anything into scripts.
- **ESM imports use `.js` suffixes** for local modules; type-only imports from `openclaw/plugin-sdk/sandbox` use `import type`.
- **createFsBridge uses the handle's OWN exec** (closure over `runShellCommand`). Intentionally **ignore** `context.backend`.
- **New runtime constraint:** the sandbox runner must provide `python3` + GNU coreutils (`stat -c`). The current runner image satisfies this.
- **Keep compat pinned:** `peerDependencies.openclaw` and `openclaw.compat.pluginApi` stay `>=2026.6.10` (no change).
- **Semver:** minor bump **0.1.0 → 0.2.0**. The release workflow requires a matching `## [0.2.0]` CHANGELOG section or the release job fails.
- **DoD gate:** `npm run check && npm run typecheck && npm test` all green before tagging.
- **Branch:** work on `feat/fs-bridge` (already created off `origin/main`). Main is PR-only; tag `v0.2.0` only after the PR merges.

## Contract (verified from `openclaw/plugin-sdk/sandbox`)

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

// existing primitive (src/backend.ts) — signature-identical to runRemoteShellScript:
type SandboxBackendCommandParams = { script: string; args?: string[]; stdin?: Buffer | string; allowFailure?: boolean; signal?: AbortSignal };
type SandboxBackendCommandResult = { stdout: Buffer; stderr: Buffer; code: number };
```

Both `createRemoteShellSandboxFsBridge` and the type `RemoteShellSandboxHandle` are re-exported from the stable `openclaw/plugin-sdk/sandbox` subpath (the same entry the backend already imports types from).

---

## Task 1: `createFsBridge` adapter module (`src/fs-bridge.ts`)

**Files:**
- Create: `src/fs-bridge.ts`
- Test: `src/fs-bridge.test.ts`

**Interfaces:**
- Consumes: `createRemoteShellSandboxFsBridge`, `RemoteShellSandboxHandle`, `SandboxFsBridge`, `SandboxFsBridgeContext`, `SandboxBackendCommandParams`, `SandboxBackendCommandResult` (from `openclaw/plugin-sdk/sandbox`).
- Produces: `createAgentSandboxFsBridge(deps: { run: RunInPod; workdir: string; sandbox: SandboxFsBridgeContext }): SandboxFsBridge`; `type RunInPod = (p: SandboxBackendCommandParams) => Promise<SandboxBackendCommandResult>`.

- [ ] **Step 1: Write the failing tests** — `src/fs-bridge.test.ts`

```ts
import { describe, expect, it, vi } from "vitest";
import type {
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxFsBridgeContext,
} from "openclaw/plugin-sdk/sandbox";
import { createAgentSandboxFsBridge } from "./fs-bridge.js";

function makeRun(result: Partial<SandboxBackendCommandResult> = {}) {
  const calls: SandboxBackendCommandParams[] = [];
  const run = vi.fn(async (p: SandboxBackendCommandParams) => {
    calls.push(p);
    return { stdout: Buffer.from(""), stderr: Buffer.from(""), code: 0, ...result };
  });
  return { run, calls };
}

// workspaceAccess: "ro" keeps reads/resolve working while skipping the rw-gated
// protected-skill mount probe, so these tests are deterministic on any machine.
const ctx = (over: Partial<SandboxFsBridgeContext> = {}): SandboxFsBridgeContext => ({
  workspaceDir: "/workspace",
  agentWorkspaceDir: "/workspace",
  workspaceAccess: "ro",
  containerName: "runner",
  containerWorkdir: "/workspace",
  docker: {},
  ...over,
});

describe("createAgentSandboxFsBridge", () => {
  it("returns a bridge exposing all 7 SandboxFsBridge methods", () => {
    const { run } = makeRun();
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    for (const m of ["resolvePath", "readFile", "writeFile", "mkdirp", "remove", "rename", "stat"]) {
      expect(typeof (b as unknown as Record<string, unknown>)[m]).toBe("function");
    }
  });

  it("resolvePath maps a relative path to a container path under workdir", () => {
    const { run } = makeRun();
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    expect(b.resolvePath({ filePath: "a/b.txt" })).toMatchObject({
      containerPath: "/workspace/a/b.txt",
    });
  });

  it("readFile delegates to the injected run and propagates its stdout", async () => {
    const { run, calls } = makeRun({ stdout: Buffer.from("hello") });
    const b = createAgentSandboxFsBridge({ run, workdir: "/workspace", sandbox: ctx() });
    const out = await b.readFile({ filePath: "notes.md" });
    expect(out.toString()).toBe("hello");
    expect(run).toHaveBeenCalled();
    // the path reaches the shell layer as a positional arg (not interpolated):
    expect(calls[0]?.args).toContain("notes.md");
  });
});
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `npm test -- fs-bridge`
Expected: FAIL — `Cannot find module './fs-bridge.js'` / `createAgentSandboxFsBridge is not a function`.

- [ ] **Step 3: Implement `src/fs-bridge.ts`**

```ts
import { createRemoteShellSandboxFsBridge } from "openclaw/plugin-sdk/sandbox";
import type {
  RemoteShellSandboxHandle,
  SandboxBackendCommandParams,
  SandboxBackendCommandResult,
  SandboxFsBridge,
  SandboxFsBridgeContext,
} from "openclaw/plugin-sdk/sandbox";

/** The buffered in-pod exec primitive every fs op runs through (the handle's runShellCommand). */
export type RunInPod = (p: SandboxBackendCommandParams) => Promise<SandboxBackendCommandResult>;

/**
 * Build OpenClaw's remote-shell fs bridge for our K8s Pod backend.
 *
 * We reuse `createRemoteShellSandboxFsBridge` (the same bridge OpenClaw's SSH
 * backend uses) instead of hand-rolling fs ops: our Pod backend is remote and
 * shares no filesystem with the host, exactly like SSH. The adapter maps the
 * bridge's minimal `RemoteShellSandboxHandle` contract onto the handle's own
 * `runShellCommand`. `remoteWorkspaceDir`/`remoteAgentWorkspaceDir` are both the
 * single container workspace (`cfg.workdir`); this backend has no separate agent
 * workspace.
 */
export function createAgentSandboxFsBridge(deps: {
  run: RunInPod;
  workdir: string;
  sandbox: SandboxFsBridgeContext;
}): SandboxFsBridge {
  const runtime: RemoteShellSandboxHandle = {
    remoteWorkspaceDir: deps.workdir,
    remoteAgentWorkspaceDir: deps.workdir,
    runRemoteShellScript: deps.run,
  };
  return createRemoteShellSandboxFsBridge({ sandbox: deps.sandbox, runtime });
}
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `npm test -- fs-bridge`
Expected: PASS (all three cases green).

- [ ] **Step 5: Lint + typecheck**

Run: `npm run check && npm run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/fs-bridge.ts src/fs-bridge.test.ts
git commit -m "feat: add createFsBridge adapter reusing the remote-shell fs bridge"
```

---

## Task 2: Wire `createFsBridge` into the handle (`src/backend.ts`)

**Files:**
- Modify: `src/backend.ts` (extract the inline `runShellCommand` at lines 54-63 into a hoisted `const`; add `createFsBridge`)
- Test: `src/backend.test.ts`

**Interfaces:**
- Consumes: `createAgentSandboxFsBridge` (Task 1); the existing local `wrapperArgvFor` const and `runBufferedWrapper`/`buildRunShellInPodCommand`.
- Produces: `SandboxBackendHandle.createFsBridge` populated on the returned handle, wired to the same `runShellCommand` closure.

- [ ] **Step 1: Add a failing wiring test** — append to `src/backend.test.ts` (before the final closing of the file, after the `createAgentSandboxBackend handle` describe block)

```ts
describe("createAgentSandboxBackend fs bridge", () => {
  it("exposes createFsBridge returning a 7-method bridge under the config workdir", () => {
    const h = createAgentSandboxBackend(args as any);
    expect(typeof h.createFsBridge).toBe("function");
    const bridge = h.createFsBridge?.({
      sandbox: {
        workspaceDir: "/workspace",
        agentWorkspaceDir: "/workspace",
        workspaceAccess: "ro",
        containerName: "runner",
        containerWorkdir: "/workspace",
        docker: {},
      },
    });
    for (const m of ["resolvePath", "readFile", "writeFile", "mkdirp", "remove", "rename", "stat"]) {
      expect(typeof (bridge as unknown as Record<string, unknown>)[m]).toBe("function");
    }
    expect(bridge?.resolvePath({ filePath: "a/b.txt" })).toMatchObject({
      containerPath: "/workspace/a/b.txt",
    });
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- backend`
Expected: FAIL — `h.createFsBridge` is `undefined` (`typeof` is `"undefined"`).

- [ ] **Step 3: Add the import** — top of `src/backend.ts`, after the existing local imports (below the `import type { BuildHandleArgs } from "./factory.js";` line)

```ts
import { createAgentSandboxFsBridge } from "./fs-bridge.js";
```

- [ ] **Step 4: Extract `runShellCommand` into a hoisted const** — in `createAgentSandboxBackend`, insert immediately after `const dockerEnv = createParams.cfg.docker.env;` and before `return {`

```ts
  const runShellCommand = async (
    params: SandboxBackendCommandParams,
  ): Promise<SandboxBackendCommandResult> => {
    const inPodCommand = buildRunShellInPodCommand({
      script: params.script,
      ...(params.args ? { args: params.args } : {}),
    });
    const argv = wrapperArgvFor(inPodCommand, false);
    return runBufferedWrapper(argv, params);
  };
```

- [ ] **Step 5: Replace the inline method with the const reference + add `createFsBridge`** — in the returned object, delete the whole inline block:

```ts
    async runShellCommand(
      params: SandboxBackendCommandParams,
    ): Promise<SandboxBackendCommandResult> {
      const inPodCommand = buildRunShellInPodCommand({
        script: params.script,
        ...(params.args ? { args: params.args } : {}),
      });
      const argv = wrapperArgvFor(inPodCommand, false);
      return runBufferedWrapper(argv, params);
    },
```

and replace it with:

```ts
    runShellCommand,
    createFsBridge: ({ sandbox }) =>
      createAgentSandboxFsBridge({ run: runShellCommand, workdir: cfg.workdir, sandbox }),
```

- [ ] **Step 6: Run the whole suite, verify pass**

Run: `npm test`
Expected: PASS (backend + fs-bridge + all existing suites).

- [ ] **Step 7: Lint + typecheck**

Run: `npm run check && npm run typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/backend.ts src/backend.test.ts
git commit -m "feat: wire createFsBridge onto the sandbox backend handle"
```

---

## Task 3: Attach an npm-pack tarball to the GitHub Release (`.github/workflows/release.yml`)

**Files:**
- Modify: `.github/workflows/release.yml`

**Why:** npm publish is blocked for a few days, so the Release must carry the built `.tgz` as a downloadable asset for a npm-free install path. `git:`/`github:` installs would fail because `dist/` is gitignored.

- [ ] **Step 1: Add a Pack step after the existing "Build" step**

The `Build` step is:
```yaml
      - name: Build
        run: npm run build
```
Insert immediately after it:
```yaml
      - name: Pack tarball
        id: pack
        run: |
          file="$(npm pack --silent)"
          echo "file=$file" >> "$GITHUB_OUTPUT"
          echo "packed asset: $file"
```
(`npm pack` re-runs `prepack`→`build`; harmless — `dist/` was just built. The filename is `openclaw-agent-sandbox-backend-<version>.tgz`.)

- [ ] **Step 2: Attach the asset in the "Create GitHub Release" step**

The final line of the `Create GitHub Release` step is currently:
```bash
          gh release create "$tag" "${args[@]}"
```
Change it to include the packed file as a positional asset:
```bash
          gh release create "$tag" "${{ steps.pack.outputs.file }}" "${args[@]}"
```

- [ ] **Step 3: Validate the workflow YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml')); print('yaml ok')"`
Expected: prints `yaml ok`. (If PyYAML is unavailable: `npx --yes yaml-lint .github/workflows/release.yml`.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: attach npm-pack tarball as a GitHub Release asset"
```

---

## Task 4: Version bump, CHANGELOG, README (prepare v0.2.0)

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `README.md`

- [ ] **Step 1: Bump the version**

In `package.json` change `"version": "0.1.0"` to `"version": "0.2.0"`.

- [ ] **Step 2: Add the CHANGELOG section** (the release job extracts notes by version — required)

In `CHANGELOG.md`, the top currently reads:
```markdown
## [Unreleased]

## [0.1.0] - 2026-06-30
```
Insert a `## [0.2.0]` section between `## [Unreleased]` and `## [0.1.0] - 2026-06-30`:
```markdown
## [Unreleased]

## [0.2.0]

### Added

- `createFsBridge` on the sandbox backend handle: file tools (read/write/edit/apply_patch)
  now operate inside the sandbox Pod via `pods/exec`, by reusing OpenClaw's own
  `createRemoteShellSandboxFsBridge` (the same hardened remote-shell bridge the SSH
  backend uses — mount-boundary enforcement, read-only protected skill dirs, symlink
  canonicalization, hardlink rejection). Enables `sandbox.mode:"all"` to cover both exec
  and file tools coherently. Requires `python3` + GNU coreutils in the sandbox runner.

### Changed

- Release workflow now attaches the built `.tgz` as a downloadable GitHub Release asset
  (supports `openclaw plugins install <path-to.tgz>` for npm-free/offline install).

## [0.1.0] - 2026-06-30
```

- [ ] **Step 3: README — document the interim release-asset install**

In `README.md`, the `## Install` section currently is:
```markdown
## Install

```bash
npm install openclaw-agent-sandbox-backend
```

The host loads the bundled plugin from `./dist/index.js` (see the `openclaw.extensions` field). Requires OpenClaw `>=2026.6.10`.
```
Insert the following block immediately after that paragraph (before `## Develop`):
```markdown

### Install without npm (GitHub Release tarball)

While an npm publish is pending, install directly from a built release asset:

```bash
# download the asset for the pinned tag, then hand the local tarball to OpenClaw:
openclaw plugins install ./openclaw-agent-sandbox-backend-0.2.0.tgz
```

`git:`/`github:` specs are NOT supported for this package — OpenClaw installs those with
`npm install --ignore-scripts`, and `dist/` is not committed, so the plugin would fail to
build. The sandbox runner must provide `python3` + GNU coreutils for the file-tool bridge.
```

- [ ] **Step 4: Final green gate**

Run: `npm run check && npm run typecheck && npm test`
Expected: all green.

- [ ] **Step 5: Verify the packaged tarball contains the new module**

Run: `npm pack --dry-run 2>&1 | grep -E "dist/fs-bridge.js|dist/index.js"`
Expected: both listed (confirms `dist/fs-bridge.js` ships).

- [ ] **Step 6: Commit**

```bash
git add package.json CHANGELOG.md README.md
git commit -m "release: v0.2.0 (createFsBridge + release-asset tarball)"
```

---

## Task 5: PR, merge, tag v0.2.0

**Files:** none (git/GitHub operations only)

**Why:** main is PR-only with a `v*` ruleset. The version bump must be on main before the tag is pushed, or the release job's "verify version matches tag" step fails.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/fs-bridge
```

- [ ] **Step 2: Open the PR** (confirm with the user before creating)

```bash
gh pr create --repo vol1003-labs/openclaw-agent-sandbox-backend --base main --head feat/fs-bridge \
  --title "feat: createFsBridge (reuse remote-shell bridge) + v0.2.0 release asset" \
  --body "Adds createFsBridge by reusing OpenClaw's createRemoteShellSandboxFsBridge; attaches the npm-pack tarball to the GitHub Release; bumps to v0.2.0."
```

- [ ] **Step 3: Wait for CI (Lint, Test, Build) to pass, then merge**

```bash
gh pr checks --repo vol1003-labs/openclaw-agent-sandbox-backend --watch
gh pr merge --repo vol1003-labs/openclaw-agent-sandbox-backend --squash --delete-branch
```

- [ ] **Step 4: Tag v0.2.0 on the merged main and push the tag**

```bash
git fetch origin
git tag v0.2.0 origin/main
git push origin v0.2.0
```

- [ ] **Step 5: Confirm the release asset exists** (after the release workflow runs)

Run: `gh release view v0.2.0 --repo vol1003-labs/openclaw-agent-sandbox-backend`
Expected: the release lists `openclaw-agent-sandbox-backend-0.2.0.tgz` as an asset.

---

## DoD

1. **Static:** `npm run check && npm run typecheck && npm test` all green; new `fs-bridge` suite passes.
2. **Contract:** `handle.createFsBridge` returns a bridge implementing all 7 methods; `resolvePath` maps under `/workspace`; `readFile` delegates to `runShellCommand`.
3. **Packaging:** `npm pack` produces `openclaw-agent-sandbox-backend-0.2.0.tgz` containing `dist/fs-bridge.js` + `dist/index.js`.
4. **Release:** merging the PR and pushing tag `v0.2.0` runs the workflow and the GitHub Release carries the `.tgz` asset (`gh release view v0.2.0` lists it).
