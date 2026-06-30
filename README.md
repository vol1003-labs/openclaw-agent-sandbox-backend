# openclaw-agent-sandbox-backend

[![CI](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/actions/workflows/ci.yml/badge.svg)](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/openclaw-agent-sandbox-backend)](https://www.npmjs.com/package/openclaw-agent-sandbox-backend)
[![GitHub release](https://img.shields.io/github/v/release/vol1003-labs/openclaw-agent-sandbox-backend)](https://github.com/vol1003-labs/openclaw-agent-sandbox-backend/releases)
[![License: MIT](https://img.shields.io/github/license/vol1003-labs/openclaw-agent-sandbox-backend)](./LICENSE)

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
| `shutdownAfterSeconds` | `86400` | Sandbox hard shutdown deadline (set to now+this at factory; a zombie-sandbox safeguard). |
| `readyTimeoutSeconds` | `120` | Max wait for the bound sandbox Pod to become Ready. |

Per-exec env is passed to the in-pod command via `env KEY=value` (consistent with OpenClaw's other sandbox backends); truly sensitive secrets should be mounted as files via the host Pod spec rather than passed as exec env.

## Host wiring

Deployment service account, NetworkPolicy, ConfigMap, RBAC, and resource quota configuration are managed separately as host/cluster infrastructure. This repo contains only the plugin code.
