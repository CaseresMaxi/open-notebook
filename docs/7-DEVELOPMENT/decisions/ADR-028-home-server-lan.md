# ADR-028: Home server with Firebase accounts and local storage

## Status

Accepted (personal fork, `feature/home-server`).

## Context

The serverless runtime (ADR-027) moves records and files to Firestore and Storage, which is more infrastructure than a household needs. The operator wants one computer to serve the local network, Firebase to manage accounts only, and the original study data to stay reachable by the operator's account no matter what happens to it in Firebase.

## Decision

- Reuse account mode with `NEXTNOOTBOOK_DATABASE_BACKEND=surrealdb` and `NEXTNOOTBOOK_STORAGE_BACKEND=local`. `docker-compose.home.yml` publishes only the web UI (8502) on the LAN.
- `NEXTNOOTBOOK_LAN_HTTP=true` extends insecure-cookie mode from loopback to private-network origins only (RFC 1918, loopback, `.local`/`.lan`/`.home`/`.home.arpa`/`.internal`). Public origins still fail validation.
- `NEXTNOOTBOOK_OWNER_EMAIL` pins the legacy installation to a verified email: the owner is recognised by the bound UID or that verified email, a recreated account rebinds (old binding kept as a backup file), and the owner is exempt from disablement and allowances. Without this variable the binding stays immutable (ADR-025).

## Consequences

Session cookies travel over plain HTTP inside the home network. Anyone who controls that network could capture a session; acceptable for a household, not for shared or public networks. Backups are the operator's responsibility (`scripts/home-backup.sh`).
