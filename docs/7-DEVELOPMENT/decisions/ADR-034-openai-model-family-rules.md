# ADR-034: OpenAI request rules by model family, not by model id

- **Status:** Accepted in personal fork
- **Date:** 2026-11-15

## Context

OpenAI request shapes changed with each family, and the app decided them with prefix checks for one family at a time: per-turn reasoning effort and the Responses tool transport only applied to `gpt-6*` ([ADR-016](ADR-016-exam-figures.md), [ADR-029](ADR-029-arc-components-and-turn-decisions.md)). A live test of the API on 2026-11-15 (gpt-5.5, gpt-5.6-*, gpt-6-*, gpt-6.1-*, o3) showed:

- Every gpt-5+ and o-series model rejects `max_tokens` and any `temperature` other than 1.
- From gpt-5.6 on, Chat Completions refuses function tools while reasoning is on. The Responses API accepts them for every reasoning model.
- `reasoning_effort="none"` is rejected by the o-series, the original gpt-5 family, `gpt-6-astra` and `gpt-6.1-sol`. The Decisions API can pick `none`, so selecting `gpt-6.1-sol`, the newest flagship, as the chat model failed the turn with a 400. No model accepts `max`; `xhigh` is the top level.

Model discovery also listed image, realtime, audio-output and moderation models as chat models, and classified `gpt-transcribe` as a language model.

## Decision

`open_notebook/ai/openai_models.py` decides OpenAI request rules from the model id's family and version (`gpt-N[.M]`, `oN`), so a new release follows the rules of its family without a code change:

- **Reasoning model:** o-series and gpt-5 or later, except `-chat` variants.
- **Tool transport:** every reasoning model calls tools through the Responses API (`chat_visuals._prepare_tool_model`).
- **Per-turn effort:** applies to every reasoning model. An unsupported `none` becomes `low`. The models that reject `none` are the one explicit list, because the API exposes no capability flag for it.

OpenAI discovery skips ids no model slot can use (image, realtime, live, audio, moderation, video, computer use) and classifies `transcribe` ids as speech-to-text. The connection test uses `gpt-6-luna`, and the default image model is `gpt-image-2.6-sunburst`, because `gpt-3.5-turbo` is retired and `gpt-image-1.5` shuts down on 2026-12-01.

## Alternatives considered

- **Keep a list of known model ids.** It breaks with every release, which is how GPT-6.1 Sol broke.
- **Retry the call on a 400 and downgrade the parameter.** This makes every failing turn slower and hides real request errors. It also does not fit the `ChatOpenAI` copies that tool binding needs.

## Consequences

- gpt-5.x and o-series models now also get per-turn effort and Responses tool calls. Before, they used their configured effort and Chat Completions tools.
- Esperanto 2.28.0, the latest release, still detects reasoning models with its own prefix list (`o1`, `o3`, `o4`, `gpt-5`). In Docker, the personal `patches/esperanto_openai.py` mount extends it. Running from source without that patch still sends `max_tokens` to gpt-6.
