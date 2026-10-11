# Firebase serverless deployment

The optional runtime uses Firebase Auth, Firestore and Storage, with separate
Cloud Run API and worker services. The frontend can use Firebase App Hosting
(`frontend/apphosting.yaml`, root directory `frontend`) or Netlify with the same
Next.js proxy settings. The local SurrealDB installation remains the default.

## Current status: local active, cloud paused

Use the existing `docker compose up -d` workflow for development. It explicitly
selects SurrealDB, local files and legacy personal authentication. Your notebooks,
sources and conversations stay on the current persistent volumes. Preserve their
encryption key. Local AI calls still use the configured provider and its existing
pricing; this separation concerns hosting and storage.

Cloud configuration lives in `firebase/cloud-runtime.env.example`,
`Dockerfile.cloud` and `frontend/apphosting.yaml`. These files do not provision
anything. Do not load cloud environment files into the local Compose service.
Deployment, real migration and infrastructure activation are **paused** until
the owner explicitly resumes them. Emulators only run on the development machine.

## Local rehearsal

Start the Firebase Auth, Firestore and Storage emulators with project
`demo-nextnootbook`. Set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8088`,
`STORAGE_EMULATOR_HOST=http://127.0.0.1:9199`,
`FIREBASE_PROJECT_ID=demo-nextnootbook` and a demo Storage bucket. Run
`uv run pytest tests/test_firestore_runtime.py`. These tests refuse live projects.

Take a fresh offline snapshot using the existing backup workflow and verify its
manifest. Run `uv run python -m firebase.migrate_runtime SNAPSHOT --owner-uid UID`
for inventory; add `--execute` only with the intended destination configured.
The tool copies records, relations, originals, chat checkpoints and pending writes,
verifies their content and writes a private report inside the snapshot. It never
deletes data or changes running services. Existing unequal destination records
abort migration. Keep the old installation and immutable Firebase archive for
rollback. Copy a new snapshot if anyone studies during the rehearsal.

## Deployment settings

Use `Dockerfile.cloud` for both backend services. Set `NEXTNOOTBOOK_SERVICE=worker`
on the worker; the API is the default. Copy the values in
`firebase/cloud-runtime.env.example`, replacing placeholders. Configure the
verified owner UID and `NEXTNOOTBOOK_ADMIN_EMAIL=maxycaseres5@gmail.com`.
Use the **existing** encryption key as a Secret Manager secret on both services.
Use attached service accounts and ADC; do not ship service-account JSON files.

Create a regional Cloud Tasks queue named `study-jobs`. Limit it to one concurrent
dispatch and three delivery attempts. Give the API identity task-enqueue access
and permission to act as the task identity. Give only the task identity Cloud Run
Invoker on the private worker. Both runtime identities need Firestore data access
and object access on the configured private bucket. Keep client Firestore and
Storage rules denied; access goes through authenticated backend routes.

Use request-based Cloud Run billing, minimum instances zero and maximum instances
one for each service. Start with API concurrency 4, 1 GiB RAM, 900-second timeout;
worker concurrency 1, 2 GiB RAM, 1,800-second timeout. OCR engines may need more
memory. Allow public invocation of the API so Firebase users can reach it; the
application itself requires authenticated sessions and explicit allowed origins.
Leave the worker private. Do not grant public worker invocation.

For App Hosting, create secret `nextnootbook-api-url` containing the API HTTPS URL
and grant the frontend backend access. It is available at build and runtime because
Next.js builds proxy rewrites. Firebase auth mode makes browser requests same-origin.
Configure the final frontend hostname in Firebase Auth authorized domains and in
both backend origin settings. Redeploy the frontend if the API URL changes.

Before switching traffic, migrate the final stopped snapshot, check the verified
report, sign in as the owner and a second account, upload a document, wait for its
processing, chat with citations, take an exam and reload both conversations.
Verify the second account cannot access owner IDs or files. Keep rollback ready.

## Costs and remaining operator actions

App Hosting and these Google Cloud services require billing authorization even
when usage fits free allowances. Minimum instances zero and maximum instances
one reduce idle costs; they do not cap total charges. Set budget alerts, retain
the default four-account limit and assign per-account AI allowances. AI provider
billing is separate. Review document-read costs for large study libraries.

Creating services, granting IAM roles, configuring secrets and switching traffic
are deployment actions; no deployment is performed by this repository change.
The currently available runtime identity cannot create all required infrastructure.
