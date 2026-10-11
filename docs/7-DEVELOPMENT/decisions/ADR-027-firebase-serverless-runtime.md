# ADR-027: Optional Firebase serverless runtime

## Decision

Keep the existing local SurrealDB installation as the default. Add an explicit
`NEXTNOOTBOOK_DATABASE_BACKEND=firestore` runtime for the private four-person MVP.
It requires Firebase authentication and private Firebase Storage. The server
selects account scopes from verified identities, never request parameters.

Preserve record IDs and relations through a restricted internal query adapter.
Unsupported queries fail explicitly. JSON payloads carry checksums; payloads
over 700 KB live as immutable private Storage objects. LangGraph checkpoints and
usage reservations use Firestore, so instances can scale to zero without losing
conversations or allowances. Cloud Tasks invokes a private worker using OIDC and
signed account context. Named tasks, leases and terminal states prevent concurrent
delivery and completed-job replay. An ambiguous enqueue remains in a durable
outbox retried when the client polls the job.

## Limits

The compatibility adapter is not a general SurrealQL interpreter. Search scans
bounded account collections and computes cosine similarity over existing vectors
of any dimension. Text search uses term ranking rather than the previous BM25
index. This is suitable for a small study group; large libraries require native
indexes or a separate search service. Scans consume document reads. Immutable
payloads remain after deletion until a separately reviewed garbage collector
exists. Cloud Tasks provides at-least-once delivery: a crash after an AI provider
responds but before committing a result may require manual recovery and cannot
guarantee exactly-once provider billing.

## Migration and rollout

Copy a verified offline snapshot into the new operational collections, preserving
the original installation and archive. Compare every record, uploaded original,
checkpoint and write. Historical pending jobs are retained in the owner archive
and marked interrupted in the operational queue; never replay them automatically.
Reuse the existing encryption key. Do not change the local default or deploy
billable infrastructure as part of the migration rehearsal.
