// After a new version of the site goes live, a tab opened before it still
// asks for the old version's code files, which no longer exist ("Failed to
// fetch dynamically imported module"). Reloading picks up the new version.
//
// At most one automatic reload a minute (not once per session as before, so a
// shopper with a tab open through two updates still recovers), so a file that
// is genuinely missing cannot cause a reload loop.

const KEY = "__kovo_new_version_reload_at__";

export function isModuleLoadError(message: string): boolean {
  return (
    message.includes("Importing a module script failed") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("error loading dynamically imported module") ||
    message.includes("Loading chunk") ||
    message.includes("Loading CSS chunk") ||
    message.includes("Unable to preload CSS")
  );
}

/** Reloads the page unless it already did so in the last minute. Returns whether it reloads. */
export function reloadForNewVersion(): boolean {
  let last = 0;
  try { last = Number(sessionStorage.getItem(KEY) || 0); } catch { /* ignore */ }
  if (Date.now() - last < 60_000) return false;
  try { sessionStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
  window.location.reload();
  return true;
}
