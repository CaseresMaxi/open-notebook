# Running NextNootbook

One command per environment. All local modes share the same data
(`./surreal_data`, `./notebook_data`); switching mode never moves or copies it.

| Command | Who can open it | Sign-in | Address |
|---|---|---|---|
| `./nextnootbook local` | this computer | none | http://localhost:8502 |
| `./nextnootbook lan` | devices on the home network | Firebase accounts | http://<this-ip>:8502 |
| `./nextnootbook remote` | `lan` + your Tailscale devices anywhere | Firebase accounts | https://nextnootbook.<tailnet>.ts.net |
| `./nextnootbook prod` | public (cloud) | Firebase accounts | not provisioned yet |

Also: `./nextnootbook status`, `logs [service]`, `backup`, `build`, `stop`.

## First time on a computer

1. `.env` with `OPEN_NOTEBOOK_ENCRYPTION_KEY=<key>`: reuse the existing key or stored AI credentials cannot be decrypted.
2. For `lan`/`remote`: `.firebase/home-runtime.env` (from `firebase/home-runtime.env.example`) and `.firebase/runtime-service-account.json`. Details: [home-server.md](home-server.md).
3. For `remote`: run it once and open the Tailscale sign-in link it prints; then add the printed `https://…ts.net` origin as instructed.

An optional, git-ignored `docker-compose.override.yml` applies personal tweaks to every mode.

## Production

`prod` describes the Firebase serverless deployment (Cloud Run + Firestore + Storage, `Dockerfile.cloud`). It is prepared but not provisioned; see [firebase-serverless.md](firebase-serverless.md).
