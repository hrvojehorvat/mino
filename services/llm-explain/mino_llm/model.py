"""Loads the instruct model once per container and generates text from it.

vLLM is imported lazily inside get_model() rather than at module import time:
it's a heavy, GPU-dependent dependency that isn't installed in every
environment (e.g. running the guardrail unit tests locally), and nothing
here should require it just to import this module.
"""

from __future__ import annotations

MODEL_NAME = "meta-llama/Llama-3.1-8B-Instruct"

_llm = None


def get_model():
    global _llm
    if _llm is None:
        from vllm import LLM

        _llm = LLM(model=MODEL_NAME)
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
