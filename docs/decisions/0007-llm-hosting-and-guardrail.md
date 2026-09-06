# 0007 — LLM hosting on Modal, and the guardrail's disclaimer-based policy

**Status:** resolved (Phase 4)

## Context
Phase 4 adds the second AI layer from CLAUDE.md: an LLM that explains a batch's `MLResult` rows in plain language. Two separate decisions needed to be made and recorded: how to host the model, and what the guardrail actually enforces.

## Decision 1 — self-hosted open-weights model on Modal, not a vendor API

`decisions/0006`'s Update 3 already earmarked "the same shape (plain stateless HTTP service now, Modal wrapper later) is the one to reuse for Phase 4's `services/llm-explain`" — this pulls that forward rather than starting `services/llm-explain` as a local dev-only Flask service the way `services/ml` still is, because generating a real explanation needs a GPU to run an 8B-class instruct model at all; there's no practical local-CPU fallback to develop against first.

**Model:** Llama 3.1 8B Instruct (Mistral 7B kept as a swappable alternative — `modal_app_mistral.py`), served via vLLM's in-process `LLM` API inside a plain Flask app, wrapped for Modal with `modal.wsgi_app()` — one Flask endpoint, same shape `services/ml` uses, no second inference server process. Chosen over a smaller model because reliably following the system prompt's constraints matters more here than raw generation quality, and 8B-class instruct models do that noticeably more reliably than sub-4B ones.

**Dev workflow:** `modal serve` against the real deployment for development, `modal deploy` for a permanent, non-ephemeral endpoint — same `LLM_SERVICE_URL`-points-at-a-Modal-endpoint pattern `ML_SERVICE_URL` uses for `services/ml`. No keep-warm/`min_containers` config; scale-to-zero cold-start latency is accepted for now, revisited only if it becomes an actual felt problem, the same way `decisions/0006` treated the original 30s ML poll latency.

**Implementation notes (issues hit getting a real deployment running):**
- vLLM `0.6.3.post1` declares only `transformers>=4.45.2` with no upper bound; an unpinned install resolved a `transformers` release whose refactored tokenizer internals it can't load (`AttributeError: TokenizersBackend has no attribute all_special_tokens_extended`). Fixed by pinning `transformers==4.46.3` alongside vLLM in both `modal_app.py` and `modal_app_mistral.py`.
- Llama 3.1's default `max_model_len` (131072) needs a KV cache larger than an A10G has free after loading the weights (`ValueError: ... larger than the maximum number of tokens that can be stored in KV cache (29200)`). Fixed by passing `max_model_len=8192` explicitly in `model.py` — this pipeline's prompts are a short fixed system prompt plus one batch's metrics, capped at 400 output tokens, so 8192 is ample headroom.

## Decision 2 — guardrail enforces a disclaimer, not a ban on diagnostic language

The guardrail (`services/llm-explain/mino_llm/guardrail.py`) is a deterministic check on the model's own generated text, run before any text leaves the service — this is the actual enforcement point; the system prompt (`prompt.py`) only asks the model nicely. On a violation, `app.py`'s `/explain` handler retries once with a stricter prompt (`build_retry_prompt`); a second violation returns `{ok: false, reason: "guardrail_violation"}` rather than ever forwarding non-compliant text.

**Original design (initial Phase 4 build):** an outright ban — any diagnostic-style language (naming a condition/disease/disorder/syndrome, medical-advice phrasing, "see a doctor") was a violation, full stop, matching CLAUDE.md's original wording: "must not diagnose or invent medical conclusions... not a medical diagnostic tool."

**Revision:** the user directly edited `prompt.py` to allow the model to name a possible condition and give medical-advice-style language when results look concerning, provided the response also states plainly that it isn't a doctor and this isn't a professional medical evaluation. This was flagged before committing: it directly contradicted CLAUDE.md's literal "must not diagnose" rule, and carries a real product-safety/liability concern — disclaimed medical-sounding language from an unvalidated statistics pipeline can still cause harm via false alarm or false reassurance. The user confirmed the intent twice ("i wanted it to be like that. it is still friendly suggestions and says that this is not a doctor") and, on being offered a choice between softening the wording or deliberately amending CLAUDE.md itself, chose the latter explicitly: "update claude.md and write something that it can diagnose but needs to note that he is not a doctor."

CLAUDE.md's AI section was updated accordingly (the LLM "may suggest a possible condition when results look concerning" but "must clearly state that it is not a doctor and this is not a professional medical evaluation" whenever it does), and `guardrail.py` was rewritten to match: a violation is now diagnostic-style language **with no accompanying not-a-doctor disclaimer** — the same language paired with a disclaimer passes. `test_guardrail.py` covers both directions explicitly (diagnostic + disclaimer → clean; diagnostic with no disclaimer → violation).

This is a deliberate, user-confirmed, twice-flagged product decision, not an oversight — it should not be silently reverted or treated as a bug in future work without the user's explicit direction.

## Update (Phase 5b) — prompt now grounded in personal-baseline data

The original `SYSTEM_PROMPT` instructed the model to "compare to other users of this app and compare to a clinical threshold or population norm" — but no such data has ever existed or been passed to this service (population-norm comparison is explicitly deferred, see `roadmap.md`'s Phase 5 scope note). Asking the model to make a comparison it had no real numbers for was the direct cause of generic, similar-sounding explanations regardless of the actual result — a problem the user flagged directly. That instruction has been removed.

In its place, `LlmService` now reads each session's already-computed `BaselineResult` (Phase 5a) and sends it alongside the raw metrics, so the model has a real per-metric signal — `isAnomalous` and `favorable` — to describe instead of inventing a comparison. This surfaced a second, more important issue the user also flagged: `isAnomalous` alone says a result deviated a lot from personal history, in either direction — it says nothing about whether that's good or bad news, so a naive "only hedge on anomalies" rule would have wrongly hedged a *great* result (e.g. reaction time far faster than usual) just because it was statistically unusual. The fix was to make favorability a deterministic fact computed in `services/ml` (a small `METRIC_DIRECTION` lookup of which metrics are lower/higher-is-better), the same reasoning that put the diagnostic/disclaimer check in `guardrail.py` rather than trusting the prompt: safety- and correctness-relevant judgments that can be made deterministically should be, not left to model behavior. `prompt.py`'s rules now branch on `isAnomalous`+`favorable` explicitly: non-anomalous or unknown-direction metrics get plain/neutral framing, favorable anomalies get unhedged good-news framing, and only unfavorable anomalies may still receive cautious, disclaimer-paired language under this decision's existing policy.

The guardrail itself (`guardrail.py`) is unchanged — it only checks that diagnostic-style language is paired with a disclaimer, which is orthogonal to how the prompt decides when to reach for that language at all.

## Consequences
- The guardrail's pattern lists (`_DIAGNOSTIC_PATTERNS`, `_DISCLAIMER_PATTERNS`) are deliberately broad regex, not exhaustive — a false positive just costs one retry; a false negative (diagnostic language with no disclaimer slipping through) is the one failure mode that must not happen.
- `services/llm-explain/tests/test_app.py` (the GPU-marked real-model eval set, exercising adversarial/edge-case prompts against the live model) has not yet been re-run since this policy changed — only a manual on-device/web spot-check has been done so far. Worth running before trusting the disclaimer-based policy under inputs designed to break it (see `roadmap.md`/`testing.md` Phase 4 sections).
- If the disclaimer-gated approach turns out to produce misleading or alarming output in practice, the fix is another CLAUDE.md revision plus a matching `guardrail.py`/`prompt.py` change — not a silent guardrail tightening that leaves CLAUDE.md's stated policy inaccurate.
