# openclaw-agent-sandbox-backend

An OpenClaw sandbox backend plugin that runs agent terminal/exec sessions inside gVisor-isolated `agent-sandbox` Pods on Kubernetes. It allocates sandboxes via `SandboxClaim` custom resources and streams terminal I/O through the Kubernetes `pods/exec` subresource — all from in-cluster, with no external tunnel required.

## Install

```bash
npm install openclaw-agent-sandbox-backend
```

The host loads the bundled plugin from `./dist/index.js` (see the `openclaw.extensions` field). Requires OpenClaw `>=2026.6.10`.

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
| `ttlIdleSeconds` | `1800` | Idle shutdown TTL (`spec.lifecycle.shutdownTime = now + this`). |
| `ttlActiveSeconds` | `300` | Active-lease TTL renewed while a command runs. |
| `renewIntervalSeconds` | `60` | How often the in-pod wrapper renews the lease/shutdownTime. |
| `readyTimeoutSeconds` | `120` | Max wait for the bound sandbox Pod to become Ready. |

## Host wiring

Deployment service account, NetworkPolicy, ConfigMap, RBAC, and resource quota configuration live in the host environment repo and are wired up in a separate session. This repo contains only the plugin code.
