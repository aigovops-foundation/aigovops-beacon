# AIGovOps Beacon — Browser Extension (MV3)

Hostname-only watcher. Signs and ships receipts to Beacon over HTTPS. **No URLs, no page content, no user identifiers** leave the browser beyond an opaque per-install ID.

## What it does

1. Listens to `tabs.onUpdated` (status === "complete") and extracts `URL.hostname`.
2. If the hostname matches the **managed allowlist** of AI services, hashes it with a per-tenant salt, signs the receipt with a per-install keypair, and POSTs to `${beaconUrl}/api/events`.
3. Off-allowlist hostnames are dropped at the source. They never enter `chrome.storage`. They never make a network call.
4. If Beacon is unreachable, receipts buffer in `chrome.storage.local` (cap 10k) and retry every minute.

## What it does NOT do

- No `webRequest` — cannot read network traffic.
- No content scripts — cannot read page content.
- No `<all_urls>` host permissions.
- No telemetry phone-home. Apache-2.0, code is here.

## Load unpacked (for Lab 2 in [LAB.md](../LAB.md))

1. Open `chrome://extensions` (or `edge://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked**, select this `extension/` folder.
4. Visit `chatgpt.com`, `claude.ai`, or `gemini.google.com`.
5. Click the extension icon — recent receipts should appear.

## Enterprise deploy (for Beta Corp)

### Chrome / Edge

Push these policies via Group Policy, Workspace Admin, Intune, or JAMF:

- **`ExtensionInstallForcelist`** — force-install pointing at your private listing or self-hosted CRX
- **`ExtensionSettings`** — pin runtime hosts and block uninstall
- **Managed storage** — populate `managedSchema.json` keys:
  - `beaconUrl` (required)
  - `tenantSalt` (required, secret)
  - `tenantId` (required)
  - `allowlist` (optional override)
  - `rateLimitPerMinute` (optional, default 30)

### Browsers supported

| Browser | Manifest | Status |
|---|---|---|
| Chrome 114+ | MV3 | ✅ v2.2 |
| Edge 114+ | MV3 | ✅ v2.2 (Chrome ext compat) |
| Firefox | MV3 | Planned v2.3 (manifest tweaks for `browser.*` namespace) |
| Safari | MV3 | Planned v2.4 (Xcode bundle) |

## Receipt format

```json
{
  "schema_version": "2.0",
  "ts": "2026-05-13T15:08:47.123Z",
  "source": "ext.chrome.v2.2.0",
  "tenant_id": "acme",
  "host": "chatgpt.com",
  "host_hash": "sha256:9a3f...e1",
  "content_hash": "sha256:5b8c...4d",
  "counter": 481723,
  "sig": "ecdsa-p256:..."
}
```

## Signing key

Per-install ECDSA P-256 keypair (Ed25519 in v2.3 — needs a small WASM blob, deferred).
Private key: stored in `chrome.storage.local`, never leaves the browser.
Public key: sent on first receipt and enrolled in Beacon's key registry.

## Icons

Placeholder PNGs in `icons/`. Replace with your brand for production builds.

## License

Apache-2.0.
