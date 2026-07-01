# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-07-01

### Fixed

- `exec-wrapper` no longer masks the real failure as `"[object Object]"` for non-`Error`
  throwables. The `ws` `ErrorEvent` that `k8s.Exec.exec()` emits on a websocket handshake
  failure (e.g. an HTTP 403 on `pods/exec`) keeps its real message on non-enumerable
  `.error` / `.message`; a new `describeError()` helper unwraps those, so the fatal line now
  reads e.g. `Unexpected server response: 403` instead of `[object Object]` (#11).

### Changed

- README: the Role now grants `get` (in addition to `create`) on `pods/exec`, since the
  `@kubernetes/client-node` Exec transport is a WebSocket (an HTTP `GET` upgrade) authorized
  as `get pods/exec` — a ServiceAccount with only `create` gets a 403 on the exec handshake.

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

### Added

- Initial release of the OpenClaw `agent-sandbox` backend plugin.
- Registers as the `agent-sandbox` backend id.
- Sandbox allocation via `SandboxClaim` bound to a `WarmPool`; delete-driven,
  NotFound-idempotent cleanup with a `shutdownAfterSeconds` dead-man's-switch.
- Terminal/exec streamed over the Kubernetes `pods/exec` subresource via a
  bundled in-cluster Node wrapper (no fork, no kubectl).
- Configuration keys: `namespace`, `warmPool`, `container`, `workdir`,
  `shutdownAfterSeconds`, `readyTimeoutSeconds`.

[Unreleased]: https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/releases/tag/v0.1.0
