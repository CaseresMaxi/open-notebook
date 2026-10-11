# ADR-026: Private study accounts and measured model access

Date: 2026-10-10. Status: implemented in the personal fork.

## Decision

Firebase remains the identity authority and Cloud Storage holds private files. SurrealDB remains the operational product database: its relationship, vector and full-text queries are retained. Each verified account selects a separate database derived from a SHA-256 UID hash, inside the configured namespace. Selection is server-side, carried through a ContextVar, and never accepts a client workspace parameter. New databases run the existing schema migrations. The bound installation owner keeps the original database and paths unchanged.

Study records, relationships, quizzes, exams, insights and embeddings are private through the selected database. Chat graphs select a separate SQLite checkpointer per account. Explicit thread pools copy context. Shared model credentials/defaults remain platform-owned; operators choose the study model and per-user override. Members cannot configure providers, inspect credentials or invoke operator tools. Registered optional accounts are scoped even when the installation starts in local mode.

The existing shared worker queue is retained. Submission attaches a signed workspace selected by the server. Execution validates the signature and restores the scope, including nested jobs. Status endpoints verify ownership before accessing shared command records. Old unsigned jobs retain the local installation behavior.

File storage supports local and Firebase backends. Firebase objects use an account prefix and private IAM access; client rules deny all direct access. Original files and image attachments are retained locally and remotely, with checksums and verified cache restoration. Uploads, symlinks and file reads stay inside the selected account root. Shared source references prevent premature file deletion. Cloud mode remains explicit; anonymous local use keeps local files.

Budgets are stored in a durable SQLite ledger on the shared API/worker volume. Atomic reservations enforce monthly tokens, calls, generated images and concurrent calls. Each LangChain provider invocation, tool round, embedding batch/retry and generated image reserves capacity before sending work. Provider token metadata reconciles successful language calls. Failed or uncertain calls retain the reservation; abandoned calls stop occupying a concurrency slot after 30 minutes. File uploads and chat/exam attachments share a per-account file allowance. This is usage control, not a monetary invoice: provider retries hidden inside SDKs, extraction service charges and token-estimation differences require provider billing reconciliation before pricing promises.

## Operating boundary

The first supported topology is one host, with API and worker sharing persistent data, usage ledger and SQLite checkpoints. SurrealDB can be a separate protected database service. Multi-host API/worker replicas without a shared durable ledger/checkpointer are unsupported; replace SQLite with distributed storage before scaling that way. Cloud objects and Firebase accounts do not make local database volumes disposable.

No hosting/domain change is part of this implementation. Local mode remains the default. Account mode fails startup if Firebase projects mismatch, encryption is missing, CORS/origins are not explicit or insecure cookies are requested for a public host. Public operation requires account mode, HTTPS and persistent private volumes.

## Evidence

The Auth-emulator integration exercises real server sessions, real separate SurrealDB databases, cross-user read/write/delete denial, private checkpoint reuse of identical thread IDs, signed background execution and administrator authorization. Unit tests cover concurrent reservations, failed calls, storage limits, path/symlink denial, account settings isolation, CSRF and unsafe startup configuration. Actual private Firebase upload, anonymous denial, checksum-restored download, deletion and Firestore writes were verified against the configured project.
