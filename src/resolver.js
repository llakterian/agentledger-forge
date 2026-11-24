// How Forge calls a resolver — kept in its own module so it can be unit-tested
// without the Forge runtime.
//
// Forge invokes a resolver with a single object:
//
//     { context: { ... }, call: { functionKey, payload, metadata } }
//
// where `call.payload` is what the caller sent. A *module* resolver (the one
// a `jira:issuePanel` module points at) is called differently: it receives
// the module payload directly and the context as the second argument.
//
// Getting this wrong is silent: `payload.op` is simply `undefined`, the
// handler falls through to its default branch and returns something that
// looks like a plausible answer instead of an error.

/**
 * Normalise a resolver's arguments into `{ payload, context }`.
 *
 * @param {any} first  The first argument Forge passed.
 * @param {any} [second] The second argument, for the module-resolver shape.
 * @returns {{payload: object, context: object}}
 */
export function unpack(first, second) {
  if (first && typeof first === 'object' && first.call && typeof first.call === 'object') {
    return {
      payload:
        first.call.payload && typeof first.call.payload === 'object' ? first.call.payload : {},
      context: first.context || second || {},
    };
  }
  return {
    payload: first && typeof first === 'object' ? first : {},
    context: second && typeof second === 'object' ? second : {},
  };
}

/**
 * Which operation a tool call asks for.
 *
 * The manifest declares the input as `operation` (see `agentledger-policy`
 * and friends in manifest.yml), so that is the name Forge delivers. `action`
 * is accepted as a fallback for hand-made calls.
 *
 * @param {object} payload
 * @returns {string|null}
 */
export function toolOperation(payload) {
  return payload?.operation || payload?.action || null;
}

/**
 * The issue key, wherever Forge decided to put it.
 *
 * @param {object} payload
 * @param {object} context
 * @returns {string|null}
 */
export function issueKeyFrom(payload, context) {
  return (
    payload?.issue?.key ||
    payload?.extension?.issue?.key ||
    payload?.key ||
    context?.issue?.key ||
    context?.extension?.issue?.key ||
    null
  );
}
