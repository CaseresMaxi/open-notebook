"""Enforce budgets before each LangChain provider call, including tool rounds."""

import json

from langchain_core.callbacks import BaseCallbackHandler

from open_notebook.usage import reserve, settle
from open_notebook.utils.token_utils import token_count


class UsageCallback(BaseCallbackHandler):
    raise_error = True
    run_inline = False

    def __init__(self, model, max_output):
        self.model = model
        self.max_output = max_output
        self.runs = {}

    def on_chat_model_start(self, serialized, messages, *, run_id, **kwargs):
        content = []
        image_tokens = 0
        for batch in messages:
            for message in batch:
                if isinstance(message.content, str):
                    content.append(message.content)
                else:
                    for block in message.content:
                        if isinstance(block, dict) and block.get("type") in {
                            "image_url",
                            "image",
                        }:
                            image_tokens += 4096
                        else:
                            content.append(json.dumps(block, ensure_ascii=False))
        units = token_count(" ".join(content)) + image_tokens + self.max_output
        self.runs[run_id] = reserve(self.model, units)

    def on_llm_start(self, serialized, prompts, *, run_id, **kwargs):
        self.runs[run_id] = reserve(
            self.model, sum(token_count(p) for p in prompts) + self.max_output
        )

    def on_llm_end(self, response, *, run_id, **kwargs):
        actual = 0
        for batch in response.generations:
            for generation in batch:
                metadata = (
                    getattr(
                        getattr(generation, "message", None), "usage_metadata", None
                    )
                    or {}
                )
                actual += metadata.get("total_tokens", 0)
        settle(self.runs.pop(run_id, None), actual or None)

    def on_llm_error(self, error, *, run_id, **kwargs):
        settle(self.runs.pop(run_id, None), state="failed")
