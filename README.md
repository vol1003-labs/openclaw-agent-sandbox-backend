# openclaw-agent-sandbox-backend

An OpenClaw sandbox backend plugin that runs agent terminal/exec sessions inside gVisor-isolated `agent-sandbox` Pods on Kubernetes. It allocates sandboxes via `SandboxClaim` custom resources and streams terminal I/O through the Kubernetes `pods/exec` subresource — all from in-cluster, with no external tunnel required.

## Getting started

```bash
npm install && npm run build && npm test
```

## Registration

The plugin registers itself as backend id `agent-sandbox`. Configure the backend in your OpenClaw host config using that id.

## Host wiring

Deployment service account, NetworkPolicy, ConfigMap, RBAC, and resource quota configuration live in the host environment repo and are wired up in a separate session. This repo contains only the plugin code.
