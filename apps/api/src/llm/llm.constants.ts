// Identifies which model/prompt produced an LLMExplanation row — bump
// MODEL_VERSION whenever the prompt or model changes so old explanations
// stay as history instead of being silently reinterpreted. See
// docs/data-model.md.
export const MODEL_ID = 'llama-3.1-8b-instruct';
export const MODEL_VERSION = '2';
