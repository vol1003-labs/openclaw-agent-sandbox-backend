# Refactor: Simplify Lifecycle — Report

## Summary

Removed lease/renewal machinery and consolidated config. `removeRuntime` is now
an unconditional delete. The exec-wrapper does a plain `pods/exec` with no
timer, no k8s patch, and no renewal loop.

## Config change

Replaced `ttlIdleSeconds` (1800), `ttlActiveSeconds` (300),
`renewIntervalSeconds` (60) with a single `shutdownAfterSeconds` (default
86400). `POSITIVE_INT_KEYS` shrunk from 4 to 2 keys.

## Files touched

| File | Change |
|------|--------|
| `src/config.ts` | Replace three TTL keys with `shutdownAfterSeconds: 86400` |
| `src/config.test.ts` | Update default snapshot + override/reject tests |
| `openclaw.plugin.json` | Remove old TTL props; add `shutdownAfterSeconds` |
| `src/constants.ts` | Remove `ACTIVE_LEASE_ANNOTATION` |
| `src/lifecycle.ts` | Remove `buildLeasePatch`, `buildLeaseReleasePatch`, `isClaimInUse`, `ACTIVE_LEASE_ANNOTATION` import |
| `src/lifecycle.test.ts` | Remove lease/in-use tests (10→5 tests in this file) |
| `src/factory.ts` | Use `cfg.shutdownAfterSeconds` instead of `cfg.ttlIdleSeconds` |
| `src/factory.test.ts` | Remove `renewIntervalSeconds` from test config |
| `src/manager.ts` | Remove `isClaimInUse` guard, `now` dep — `removeRuntime` is now unconditional |
| `src/manager.test.ts` | Remove busy-guard test; remove `ACTIVE_LEASE_ANNOTATION` import and `now` injection |
| `src/backend.ts` | Remove `AGENT_SANDBOX_TTL_*` / `AGENT_SANDBOX_RENEW_*` env vars from `buildExecSpec` and `runBufferedWrapper`; drop unused `cfg` param from `runBufferedWrapper` |
| `src/backend.test.ts` | Replace TTL-var-present assertions with TTL-var-absent assertions |
| `src/exec-wrapper.ts` | Remove `intEnv` helper, `ttlActive`/`ttlIdle`/`renewInterval` reads, `CustomObjectsApi` setup, `patchOpts`, `renew` fn, `setInterval`, `finally` lease-release patch; remove imports of `buildLeasePatch`, `buildLeaseReleasePatch`, `computeRfc3339`, GVR constants |
| `README.md` | Update Configuration table; add exec-env note |

## Grep-clean result

```
rg -n 'ACTIVE_LEASE_ANNOTATION|buildLeasePatch|buildLeaseReleasePatch|isClaimInUse|ttlIdleSeconds|ttlActiveSeconds|renewIntervalSeconds|AGENT_SANDBOX_TTL_|AGENT_SANDBOX_RENEW|setInterval' src index.ts
```

Only 3 hits — all in `src/backend.test.ts` as `.not.toHaveProperty("AGENT_SANDBOX_TTL_...")` string
literals asserting the keys are absent. No live symbol references remain.

## Typecheck

```
tsc -p tsconfig.json --noEmit
(exit 0, no output)
```

## Full test suite

```
Test Files  13 passed (13)
Tests  56 passed (56)
```

(62 → 56: 6 removed tests — lease/in-use tests in lifecycle.test.ts and manager.test.ts)

## Build output

`dist/index.js` ✓  
`dist/src/exec-wrapper.js` ✓

## exec-wrapper confirmation

`src/exec-wrapper.ts` now has no `setInterval`, no lease PATCH, no `CustomObjectsApi`,
no `buildLeasePatch`/`buildLeaseReleasePatch`/`computeRfc3339` imports. Flow is:
parse args → parse execEnv → compose in-pod argv → `kc.loadFromCluster()` →
`new k8s.Exec(kc).exec(...)` → `process.exit(exitCode)`.
