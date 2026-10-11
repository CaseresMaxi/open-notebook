# Private accounts without deploying the application

## What is available

- Firebase registration, verified email/Google sign-in and HttpOnly server sessions.
- Automatic private notebooks, notes, sources, summaries, exams and chat for each account.
- Private files and image answers with a local cache and optional Firebase Storage.
- Study capabilities enabled by default: source embedding, retained originals and visual chat responses.
- Operator-selected language model, per-user override and monthly/concurrency/file limits.
- `/admin/accounts` for verified administrators; usage in `/profile`.

Default allowance: 500,000 AI tokens, 1,000 provider calls and 30 generated raster images per UTC calendar month, three concurrent calls, and 500 MiB of retained files. HTML diagrams use language calls. These are initial editable limits, not a published pricing plan. Failed or uncertain calls retain their reserved allowance to avoid untracked spend. File allowance covers originals and image attachments; it is not the total database size.

## Local and account modes

`NEXTNOOTBOOK_AUTH_MODE=legacy` preserves anonymous/password local use. An optional signed-in account receives its private workspace; the bound owner sees the original installation. Logging out clears account caches. Local anonymous access is a development choice and must never be exposed publicly.

Account mode configuration (private environment, not committed):

```dotenv
NEXTNOOTBOOK_AUTH_MODE=firebase
FIREBASE_PROJECT_ID=your-project
FIREBASE_WEB_CONFIG={"apiKey":"public-web-key","authDomain":"your-project.firebaseapp.com","projectId":"your-project","appId":"public-app-id"}
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase.json
NEXTNOOTBOOK_ADMIN_EMAIL=verified-owner@example.com
NEXTNOOTBOOK_ALLOWED_ORIGINS=https://your-domain.example
CORS_ORIGINS=https://your-domain.example
NEXTNOOTBOOK_STORAGE_BACKEND=firebase
FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXTNOOTBOOK_DATA_ROOT=/app/data
NEXTNOOTBOOK_USAGE_DB=/app/data/platform/usage.sqlite
NEXTNOOTBOOK_LEGACY_OWNER_FILE=/app/data/account-owner.json
```

For private localhost testing only, use explicit loopback origins and `NEXTNOOTBOOK_INSECURE_LOCAL_COOKIES=true`. Otherwise cookies require HTTPS. Keep existing encryption material to preserve credential decryption.

The runtime service account has Auth administration, object administration and bucket metadata read on the chosen private bucket, plus Firestore data access for verified archival copies. Do not grant public object access. The application checks ownership before using its server credentials. Storage and Firestore client rules deny direct reads/writes.

## What persists where

| Information | Operational storage |
|---|---|
| Identity | Firebase Authentication |
| Notebooks, relationships, sources, notes, exams, embeddings | Private account SurrealDB database |
| Original files and image attachments | Private Firebase objects when enabled, plus local cache |
| Chat graph/checkpoints | Private account SQLite store on the persistent volume |
| Model configuration and encrypted credentials | Platform SurrealDB database |
| Allowances and reservations | Shared persistent usage SQLite ledger |
| Verified complete migration archive | Account-scoped Firebase Storage and Firestore |

The original owner's data keeps its original IDs and relationships. Cloud archives are verified copies and do not silently replace the runtime database. Retain volumes and backups. Move the durable database/checkpoint/ledger volumes with the application when hosting is configured later.

## Verification

```bash
uv run pytest tests/
PYTHONPATH="$PWD" GOOGLE_APPLICATION_CREDENTIALS=/path/to/private-test-certificate.json \
  npx firebase-tools@15.33.0 emulators:exec --project demo-nextnootbook --only auth \
  'uv run python firebase/check-account-sessions.py'
```

The integration refuses a real Auth project and uses a dedicated `qa_` namespace on the local SurrealDB service. It removes only that test namespace after success. See ADR-026 for topology and measurement limits.

Hosting, the purchased domain, public TLS and provider payment credentials have not been configured by this task.
