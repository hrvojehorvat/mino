// Identifies which baseline algorithm produced a BaselineResult row — bump
// MODEL_VERSION whenever services/ml's baseline math changes so old rows
// stay as history instead of being silently reinterpreted. See
// docs/data-model.md.
export const MODEL_ID = 'personal-baseline-zscore';
export const MODEL_VERSION = '2';
