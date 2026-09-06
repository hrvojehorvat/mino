"""Loads the instruct model once per container and generates text from it.

vLLM is imported lazily inside get_model() rather than at module import time:
it's a heavy, GPU-dependent dependency that isn't installed in every
environment (e.g. running the guardrail unit tests locally), and nothing
here should require it just to import this module.
"""

from __future__ import annotations

import os

# Overridable so the same guardrail/prompt/Flask code can be deployed against
# a different instruct model (e.g. modal_app_mistral.py) without duplicating it.
MODEL_NAME = os.environ.get("MINO_LLM_MODEL_NAME", "meta-llama/Llama-3.1-8B-Instruct")

_llm = None


def get_model():
    global _llm
    if _llm is None:
        from vllm import LLM

        # Llama 3.1's default max_model_len (131072) needs a KV cache larger
        # than an A10G has free after loading the weights. Our prompts are a
        # short fixed system prompt plus a batch's metrics, capped at 400
        # output tokens, so 8192 is ample headroom.
        _llm = LLM(model=MODEL_NAME, max_model_len=8192)
    return _llm


def generate(system_prompt: str, user_prompt: str) -> str:
    from vllm import SamplingParams

    llm = get_model()
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]
    outputs = llm.chat(messages, SamplingParams(temperature=0.3, max_tokens=400))
    return outputs[0].outputs[0].text.strip()
