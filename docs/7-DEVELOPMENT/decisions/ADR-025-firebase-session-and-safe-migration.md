# ADR-025: Firebase server sessions and verified personal data copies

Date: 2026-10-10. Status: implemented; the temporary staging boundary is superseded by ADR-026.

## Context

The owner requested Firebase signup, administrator access for their verified email and complete preservation of existing study material. The current SurrealDB schema and graph/checkpoint runtime are single-user. An account UI must not imply existing records are safely shared among users.

## Decision

Use the Firebase Web SDK only to authenticate. Exchange a recent ID token for an HttpOnly, same-site server session. Require an explicitly allowed Origin on session creation/logout, a verified email and revocation checks. Never persist Firebase ID tokens in localStorage. Configuration exposes only public Web SDK fields. Bootstrap the admin custom claim exclusively from the server's configured email matched against Firebase's verified account. Read current account claims when authorizing requests.

The owner's existing installation remains local by default. Optional Firebase account screens are available when configured, without replacing the local authentication mode. The existing personal data is bound once to the verified administrator UID in a private atomic owner manifest, without rewriting or deleting study records.

Firebase mode is opt-in. Legacy installations retain password authentication. ADR-026 replaces the initial staging gate with server-selected private databases, checkpoint stores and signed worker contexts. New verified members receive their own workspace. Claims are not a replacement for workspace scoping.

Keep the application's runtime database until its repository, graph queries, embeddings, relationships and checkpoint persistence have a verified replacement. Never automatically delete or switch storage after a cloud copy. Snapshot all database records, schema and files while writers are stopped. Preserve encryption material privately for restoration. Verify local source paths and SQLite integrity before transfer.

Copy the immutable snapshot to account-scoped private Firebase Storage and Firestore migration collections. Hash and download-verify every file; verify every Firestore record and table count. Retrying uses content-addressed migration IDs and immutable objects. Large records remain in the verified complete JSON archive to avoid Firestore document limits. Mark success as `verified-copy`, explicitly `runtimeCutover: false`. A failed/incomplete transfer is never reported as migration completion.

Client Storage and Firestore rules deny all access; backend IAM enforces account ownership. The runtime identity has Auth administration, object administration and metadata read on the chosen private bucket, and Firestore data access for verified archives. Production should use workload identity and HTTPS instead of local service-account files or insecure local cookies.

## Remaining cutover gates

- Enable billed Storage and choose resource location.
- Sign in as the owner's verified account and obtain its immutable Firebase UID.
- Provision Firestore/Storage, apply private rules and least privilege IAM.
- Run verified-copy and independently restore/check the snapshot.
- Implement workspace-scoped runtime repositories, graph isolation and cloud object handling.
- Freeze writes for a final snapshot; validate old/new read behavior before switching.
- Retain original volumes and rollback capability. Publish only after these gates and payment/usage authorization are implemented.
