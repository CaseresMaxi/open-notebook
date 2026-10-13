# Home server: accounts in Firebase, everything else on your computer

This setup turns one computer into the NextNootbook server for your home network.

| What | Where |
|---|---|
| Accounts, sign-in, Google login, email verification | Firebase Authentication |
| Notebooks, sources, notes, exams, embeddings | SurrealDB on this computer (`./surreal_data`) |
| Uploaded files, chat history, usage ledger | `./notebook_data` on this computer |
| AI provider credentials | SurrealDB on this computer (encrypted) |

Nothing is uploaded to Firebase Storage or Firestore. Firebase only answers "who is this person".

## The owner account

`NEXTNOOTBOOK_OWNER_EMAIL` names the account that owns the original installation. That account:

- always opens the original database, with every existing notebook and source;
- keeps that access if the Firebase account is deleted and created again with the same verified email (the binding moves to the new UID, the previous binding is kept as `account-owner.json.<old-uid>.bak`);
- can never be disabled from `/admin/accounts` and has no usage limits.

Every other account gets its own private, empty workspace (`user_<hash>` database and `notebook_data/users/<hash>/`).

## Setup

1. Copy `firebase/home-runtime.env.example` to `.firebase/home-runtime.env` and fill it in. List in `NEXTNOOTBOOK_ALLOWED_ORIGINS` and `CORS_ORIGINS` every address you will type in the browser, with port `8502`.
2. Place the Firebase service account key at `.firebase/runtime-service-account.json` (git-ignored).
3. Add the same hosts to Firebase → Authentication → Settings → **Authorized domains** (needed for Google sign-in).
4. Give the computer a fixed address: a DHCP reservation in the router, or use its mDNS name (`<hostname>.local`, served by Avahi).
5. Start:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.override.yml \
     -f docker-compose.home.yml up -d
   ```

6. Open `http://<address>:8502` from any device on the network and sign in.

Only port 8502 is published to the network. The API (5055) and SurrealDB (8000) stay on loopback; the web UI proxies `/api` internally so the session cookie is same-origin.

## Plain HTTP on the LAN

Account mode normally requires HTTPS. `NEXTNOOTBOOK_LAN_HTTP=true` together with `NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES=true` allows HTTP only when every origin is a private address (`10/8`, `172.16/12`, `192.168/16`, loopback) or a home-network name (`*.local`, `*.lan`, `*.home`, `*.home.arpa`, `*.internal`). The server refuses to start with a public origin. Do not forward port 8502 on your router; for access from outside, use a VPN (Tailscale, WireGuard) or put HTTPS in front and drop these flags.

## Backups

```bash
scripts/home-backup.sh            # writes ./backups/<timestamp>/
```

Exports every database in the namespace (original + one per account) as SurrealQL and archives `notebook_data`. Keep a copy on another disk. Restore with `surreal import` and by extracting the archive into `./notebook_data`.

## Going back to single-user local mode

Start without `-f docker-compose.home.yml`. The data is the same; only sign-in changes.
