# openclaw-agent-sandbox-backend

[![CI](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/openclaw-agent-sandbox-backend)](https://www.npmjs.com/package/openclaw-agent-sandbox-backend)
[![GitHub release](https://img.shields.io/github/v/release/vol1003-labs/openclaw-agent-sandbox-backend)](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/releases)
[![License: MIT](https://img.shields.io/github/license/vol1003-labs/openclaw-agent-sandbox-backend)](./LICENSE)

An OpenClaw sandbox backend plugin that runs agent terminal/exec sessions inside gVisor-isolated [Kubernetes-aigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox) Pods on Kubernetes. It allocates sandboxes via `SandboxClaim` custom resources and streams terminal I/O through the Kubernetes `pods/exec` subresource — all from in-cluster, with no external tunnel required.

## Install

```bash
npm install openclaw-agent-sandbox-backend
```

The host loads the bundled plugin from `./dist/index.js` (see the `openclaw.extensions` field). Requires OpenClaw `>=2026.6.10`.

### Install without npm (GitHub Release tarball)

To install from a GitHub Release asset instead of npm, download the `.tgz` and hand it to OpenClaw:

```bash
# download the asset for the pinned tag, then hand the local tarball to OpenClaw:
openclaw plugins install ./openclaw-agent-sandbox-backend-0.2.0.tgz
```

`git:`/`github:` specs are NOT supported for this package — OpenClaw installs those with
`npm install --ignore-scripts`, and `dist/` is not committed, so the plugin would fail to
build.

## Develop

```bash
npm install && npm run build && npm test
```

## Registration

The plugin registers itself as backend id `agent-sandbox`. Configure the backend in your OpenClaw host config using that id.

## Configuration

All keys are optional; defaults are shown. Provide overrides via the plugin config in your OpenClaw host config.

| Key | Default | Description |
| --- | --- | --- |
| `namespace` | `openclaw` | Namespace the `SandboxClaim`/Pod live in. |
| `warmPool` | `openclaw-runner` | `WarmPool` the claim binds from (`spec.warmPoolRef.name`). |
| `container` | `runner` | Container to exec into within the sandbox Pod. |
| `workdir` | `/workspace` | Working directory for exec sessions. |
| `shutdownAfterSeconds` | `86400` | Sandbox hard shutdown deadline (set to now+this at factory; a zombie-sandbox safeguard). |
| `readyTimeoutSeconds` | `120` | Max wait for the bound sandbox Pod to become Ready. |

Per-exec env is passed to the in-pod command via `env KEY=value` (consistent with OpenClaw's other sandbox backends); truly sensitive secrets should be mounted as files via the host Pod spec rather than passed as exec env.

## Host wiring

This repo ships only the plugin. The plugin talks to Kubernetes **in-cluster only**
(`loadFromCluster()`, no kubeconfig), so the OpenClaw host must run as a Pod. You provide,
in the target `namespace`:

- **agent-sandbox controller + CRDs** — [kubernetes-sigs/agent-sandbox](https://github.com/kubernetes-sigs/agent-sandbox)
  installed (`SandboxClaim`, `Sandbox`, `WarmPool`).
- **A `WarmPool`** (default `openclaw-runner`) whose Pod template has the runner container
  (default `runner`) providing `python3` + GNU coreutils (for the file-tool bridge) and the
  `workdir` (default `/workspace`).
- **RBAC** binding the host's ServiceAccount to the Role below.

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: openclaw-agent-sandbox
  namespace: openclaw # match the `namespace` config
rules:
  - apiGroups: [extensions.agents.x-k8s.io]
    resources: [sandboxclaims]
    verbs: [get, create, patch, delete]
  - apiGroups: [agents.x-k8s.io]
    resources: [sandboxes]
    verbs: [get]
  - apiGroups: [""]
    resources: [pods]
    verbs: [get]
  - apiGroups: [""]
    resources: [pods/exec]
    # `get` is required: @kubernetes/client-node's Exec uses a WebSocket (an HTTP GET upgrade),
    # authorized as `get pods/exec` — not the legacy SPDY/POST `create`. A ServiceAccount with
    # only `create` gets a 403 on the exec handshake.
    verbs: [get, create]
```

NetworkPolicy, quotas, and other cluster hardening are the operator's choice and out of scope.
