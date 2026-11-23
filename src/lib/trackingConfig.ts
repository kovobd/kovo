// Runtime tracking configuration cache.
// LayoutDataProvider populates this once the layout query resolves.
// Prevents pointless Meta CAPI edge-function invocations on every page
// navigation when no Meta pixel is configured for the project.

let metaEnabled: boolean | null = null;

/** Called by LayoutDataProvider after pixels are known. */
export const setMetaTrackingEnabled = (enabled: boolean) => {
  metaEnabled = enabled;
};

/**
 * Returns:
 *  - `true`  → at least one Meta pixel configured → send CAPI
 *  - `false` → confirmed no Meta pixel → skip CAPI
 *  - `null`  → not yet resolved → callers may queue/skip conservatively
 */
export const isMetaTrackingEnabled = (): boolean | null => metaEnabled;
