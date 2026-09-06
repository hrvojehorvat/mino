from __future__ import annotations

import modal

# Same shape as modal_app.py (Llama), swapped for Mistral 7B Instruct so the
# two can be deployed side by side and compared. Mistral's weights are
# non-gated (plain Apache 2.0, no license click-through on Hugging Face), so
# this needs no HF secret — see docs/decisions/0007.
MODEL_NAME = "mistralai/Mistral-7B-Instruct-v0.3"

app = modal.App("mino-llm-explain-mistral")

image = (
    modal.Image.debian_slim(python_version="3.11")
    # See modal_app.py for why transformers is pinned alongside vllm.
    .pip_install(
        "vllm==0.6.3.post1", "transformers==4.46.3", "flask>=3.0", "hf_transfer"
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "MINO_LLM_MODEL_NAME": MODEL_NAME})
    .add_local_python_source("mino_llm")
)

hf_cache = modal.Volume.from_name("mino-llm-hf-cache-mistral", create_if_missing=True)


@app.function(
    image=image,
    gpu="A10G",
    volumes={"/root/.cache/huggingface": hf_cache},
    scaledown_window=300,
    timeout=600,
)
@modal.concurrent(max_inputs=4)
@modal.wsgi_app()
def web():
    from mino_llm.app import app as flask_app

    return flask_app
