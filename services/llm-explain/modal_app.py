from __future__ import annotations

import modal

app = modal.App("mino-llm-explain")

image = (
    modal.Image.debian_slim(python_version="3.11")
    # transformers pinned: vllm 0.6.3.post1 only declares transformers>=4.45.2
    # (no upper bound), so an unpinned install resolves to the latest release —
    # whose refactored tokenizer internals (TokenizersBackend) this vllm version
    # can't load, raising "AttributeError: ... has no attribute
    # all_special_tokens_extended" at model init.
    .pip_install(
        "vllm==0.6.3.post1", "transformers==4.46.3", "flask>=3.0", "hf_transfer"
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
    .add_local_python_source("mino_llm")
)

# Persists downloaded model weights across cold starts, so a scaled-to-zero
# container isn't re-downloading ~16GB from Hugging Face on every first call
# (decisions/0007 accepts cold-start latency, not repeated download time).
hf_cache = modal.Volume.from_name("mino-llm-hf-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu="A10G",
    secrets=[modal.Secret.from_name("huggingface-secret")],
    volumes={"/root/.cache/huggingface": hf_cache},
    scaledown_window=300,
    timeout=600,
)
@modal.concurrent(max_inputs=4)
@modal.wsgi_app()
def web():
    from mino_llm.app import app as flask_app

    return flask_app
