# ADR-019: Notebook chat context controls

- **Status:** Accepted in personal fork
- **Date:** 2026-10-08

## Context

Notebook source/note inclusion controls do not control accumulated conversation history. Long conversations also replay saved figures and clarification metadata. A user needs to inspect memory, bound it and restart it without necessarily erasing the transcript.

## Decision

Keep `history_turns` (nullable previous-exchange limit) and `history_start` (restart boundary) in the notebook chat's existing LangGraph checkpoint state. Select whole human-led exchanges before expanding visual/follow-up metadata and provisioning the model. Include the pending question regardless of the previous-exchange limit. New sessions default to all history.

Expose notebook-session memory status, limit update, restart and history-delete endpoints. Verify the session's notebook relationship, normalize IDs and bind query parameters. Memory status counts the same expanded history as model provisioning, excluding the system prompt and using an image-token estimate. Material selections remain the existing notebook-page source/note configuration; the panel changes those controls rather than maintaining a second selection state.

Restart advances the boundary and clears the latest stored source context while preserving visible messages. Increasing the window never restores pre-boundary exchanges. Physical deletion uses the SQLite checkpointer's `delete_thread`, removing superseded checkpoints as well as the latest history, then creates an empty checkpoint retaining the history limit. Separately saved exams/tests remain independent records.

Serialize notebook turns, memory operations and session deletion per normalized session ID. Synchronous checkpoint/model work runs off the event loop; if the request disconnects, wait for that work before releasing the lock. Locks are process-local, matching the current single-process API deployment; multiple API processes would need shared locking.

## Alternatives considered

- Deleting only the latest message state leaves earlier checkpoints available for restoration; use thread deletion for permanent cleanup.
- Truncating stored messages to enforce a limit loses the readable transcript; select the model input instead.
- AI summarization introduces a model dependency and cannot guarantee that forgotten details disappear.

## Consequences

No database migration, summarization model or additional AI call is required. Defaults preserve existing conversations. Restart is a model-input boundary, not physical erasure. Excluding materials cannot undo their text already quoted in old replies; users can restart memory when needed. Permanent history deletion requires UI confirmation. File compaction, provider-side retention and independently saved test records are outside this operation.

Changes are published only to the personal fork under the repository's current publishing policy.
