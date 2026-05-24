/**
 * Stale-bundle detection.
 *
 * When we deploy a new client bundle, tabs that have been sitting open for
 * hours still run the OLD JavaScript. That old code may not understand the
 * current cookie/auth conventions (e.g. before we moved to __Host- cookies,
 * old tabs silently failed to log in). Hard refreshing fixes it, but most
 * users don't realise they need to.
 *
 * Strategy:
 *   1. At runtime, read the hash from this page's own <script src="...">
 *      tag (e.g. "C5xS4Daw" from "assets/index-C5xS4Daw.js").
 *   2. Server /api/status returns `bundleHash` \u2014 the hash from the
 *      currently-served index.html (read at server start).
 *   3. If they differ, the server is serving a newer bundle than this tab
 *      is running. We do a one-shot location.reload() to pick it up.
 *
 * We only auto-reload once per page lifetime to avoid loops if something
 * misbehaves.
 */
import { apiUrl } from "./auth";

let reloadedOnce = false;

function getOwnBundleHash(): string | null {
  // Find the module script tag that loaded us (index-XXXX.js).
  const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>("script"));
  for (const s of scripts) {
    const src = s.getAttribute("src") || "";
    const m = src.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
    if (m) return m[1];
  }
  return null;
}

export async function checkAndReloadIfStale(): Promise<void> {
  if (reloadedOnce) return;
  const ownHash = getOwnBundleHash();
  if (!ownHash) return; // dev mode or unbundled \u2014 nothing to compare
  try {
    const res = await fetch(apiUrl("/api/status"), { credentials: "include" });
    if (!res.ok) return;
    const data = await res.json();
    const serverHash: string | undefined = data?.bundleHash;
    if (!serverHash) return;
    if (serverHash !== ownHash) {
      reloadedOnce = true;
      // location.reload(true) is deprecated; modern browsers honour the
      // server's cache-control on the HTML (DYNAMIC, no-cache), so this
      // pulls a fresh index.html which references the new bundle hash.
      window.location.reload();
    }
  } catch {
    // Network blip \u2014 ignore. We'll check again on the next focus.
  }
}

/**
 * Run the check now (on app mount) and again whenever the tab is re-focused
 * (the most likely moment for a stale tab to come back to life).
 */
export function installStaleBundleWatcher(): void {
  // Initial check after a small delay so the rest of the app can mount.
  setTimeout(() => {
    void checkAndReloadIfStale();
  }, 1000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkAndReloadIfStale();
    }
  });

  window.addEventListener("focus", () => {
    void checkAndReloadIfStale();
  });
}
