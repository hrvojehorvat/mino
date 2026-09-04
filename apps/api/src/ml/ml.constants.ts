// Identifies which compute pipeline produced an MLResult row — bump
// MODEL_VERSION whenever services/ml's math changes so old rows stay as
// history instead of being silently reinterpreted. See docs/data-model.md.
export const MODEL_ID = 'signal-features';
export const MODEL_VERSION = '2';
