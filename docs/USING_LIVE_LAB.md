# Using the live Beacon Lab service

The Framework Lab pages on this site (`lab.html`, `lab-100.html`, `lab-200.html`) are static — they do all their crypto in your browser with `tweetnacl` and store progress in `localStorage`. They never talk to a server.

If you want the *same* curriculum backed by a **real multi-tenant service** with admin controls, server-side signing keys, magic-link trainee invites, and a database of receipts and bundles, use the live lab:

> **[https://aigovops-beacon-lab.pplx.app](https://aigovops-beacon-lab.pplx.app)**

The live lab is the Express + React app under [`lab-service/`](../lab-service/) deployed on Perplexity Computer. Source for everything below: [`lab-service/server/routes.ts`](../lab-service/server/routes.ts) and [`lab-service/client/src/pages/`](../lab-service/client/src/pages/).

---

## Three ways in

| Path | Who | What it gives you |
|---|---|---|
| **Demo** | Anyone, no credentials | One-click trainee session pre-loaded with the **AiGovOps Foundation** tenant — 5 inventory items, 9 Level-200 rules, signing keys ready. Survives refresh. |
| **Magic link** | Trainees in a workshop | A single-use, time-limited token URL the instructor issues from the admin console. Lands you in a real tenant scoped to your label. |
| **Admin** | Instructor / lab owner | Lab control (pause / resume / reset), magic-link issuance, evidence dashboard, security log. |

All three use the same `__Host-beacon_session` HttpOnly cookie under the hood, so sessions persist across refresh and survive cold-starts.

---

## Step 1 — Launch the demo (60 seconds)

1. Open **[https://aigovops-beacon-lab.pplx.app](https://aigovops-beacon-lab.pplx.app)** in a fresh tab.
2. Scroll past the *Sign in* card to the second card: **"No credentials? Try the demo."**
3. Click **Launch demo lab**.
4. You land at `/#/lab` with the header **"AiGovOps Beacon Lab — AiGovOps Foundation · Demo trainee"** and a session key fingerprint like `ed25519:4fbee7bb…`.

What you should see:

- **Overview** tab — tenant summary, signing key fingerprint, your session label.
- **Lab 100 — Foundations** tab (default) — 5 pre-loaded inventory items including the high-risk *Donor Sentiment Scorer (DRAFT)*.
- **Lab 200 — Deep dive** tab — extended 9-rule checklist, fix-failing-items panel, Policy-as-Code editor.
- **My evidence** tab — empty until you generate a receipt or bundle.

---

## Step 2 — Run the Level 100 flow

Inside the Lab 100 tab:

1. **Step 1 — Discover inventory**: scroll the 5 seeded items. Each has a name, owner email, risk level, and lifecycle state. Note the DRAFT-state high-risk item — Lab 100 expects you to flag it.
2. **Step 2 — Evaluate checklist**: click **Run Level 100 checklist**. The server evaluates 5 rules against the inventory, returns a result like *Overall: pass (5 rules evaluated, 0 failed)*, and stamps a signed receipt (`gate.evaluated`). Receipt `id`, signature, and signing-key fingerprint appear on screen — these are real Ed25519 signatures, verifiable with the tenant's published public key.
3. **Step 3 — Bundle & verify**: click **Create signed bundle**. The server builds a Merkle tree over all receipts in your session and signs the root. You get back a `bundle.id`, a `root` hash, and the `sig`. Click *Verify bundle* on the **My evidence** tab to re-check the chain.

Everything you generate is persisted server-side under your demo session for 8 hours, and shows up in the admin Evidence tab.

---

## Step 3 — Run the Level 200 deep dive

Switch to the **Lab 200 — Deep dive** tab:

1. **Run Level 200 checklist** — 9 rules instead of 5, including model-card presence, DPIA linkage, and incident-response runbook checks.
2. **Fix failing items** — if any rule fails, edit the inventory items inline; the next checklist re-evaluation will show the fix.
3. **Policy-as-Code** — edit the JSON policy document in the inline editor and re-evaluate. The lab teaches you what real policy diff-and-redeploy looks like in a governance pipeline.

Every action mints another receipt, all of which you can bundle and verify the same way as Level 100.

---

## Step 4 — Become an admin (instructor flow)

Click **Log out** to return to `/#/`, then click the **Admin** tab on the Sign in card.

- **Password**: the lab is provisioned with the admin password your instance owner set in `ADMIN_PASSWORD`. For the canonical deployment it is the value you were given out-of-band; do not commit it.
- Click **Sign in as admin**.

You land at `/#/admin` with four sections:

| Tab | What you can do |
|---|---|
| **Lab control** | Pause the lab (trainees see a banner; new sessions blocked except for admins), resume, reset all lab data back to the seeded baseline, view per-tenant signing key fingerprints. |
| **Magic links** | Issue a one-shot login URL: pick a tenant, set a label like "Sarah – Acme Corp", set a TTL (default 60 min), click **Issue link**. The resulting `https://…/#/login?t=<token>` is single-use, time-limited, and revocable. |
| **Evidence** | Browse every receipt and bundle every trainee has produced, filterable by tenant. Useful for grading workshop output. |
| **Security** | Recent login activity, rate-limit state (the global anti-brute-force counter), and the current lab pause state. |

Admin sessions also persist across refresh and follow the same retry/cold-start behaviour as trainee sessions.

---

## Step 5 — Run a workshop with magic links

1. Sign in as admin.
2. Open the **Magic links** tab.
3. For each trainee, fill in:
   - **Tenant**: which seeded tenant they should work inside (e.g. *AiGovOps Foundation* or *Beacon Foundation Inc.*).
   - **Label**: free-text, shows up on their session header (e.g. "Dana – CWU capstone").
   - **TTL**: how long the *link itself* is valid before redemption. The *session* once redeemed always lasts 8 hours.
4. Click **Issue link**. Copy the URL. Share it however your workshop runs — Slack DM, Teams, printed cards, projected QR code.
5. The trainee clicks the link, lands directly on `/#/lab` with their scoped session. They never see a password screen.

To revoke a link before redemption, click **Revoke** on its row in the Latest links panel. The link rejects with `401 Token revoked`.

---

## What the GitHub Pages lab teaches vs. what the live lab teaches

| Topic | Pages lab (static) | Live lab (server-backed) |
|---|---|---|
| Concept walkthrough | ✅ Full | Same concepts, hands-on |
| Sign a receipt in browser | ✅ tweetnacl in JS | ✅ Server-signed (Ed25519 in Node) |
| Verify a bundle | ✅ tweetnacl in JS | ✅ Verify against server-published public key |
| Multi-tenant | ❌ | ✅ Per-tenant signing keys |
| Persistent evidence | ❌ (localStorage only) | ✅ SQLite, survives admin restart |
| Pause/resume orchestration | ❌ | ✅ |
| Magic-link trainee onboarding | ❌ | ✅ |
| Receipt / bundle history | ❌ | ✅ |
| Policy-as-Code re-evaluation | Static text | ✅ Live edit + re-run |
| Workshop ready | Individual self-study | Group + facilitator |

Use the Pages lab to read and reflect. Use the live lab when you want to **practise the operator's seat** — instructor, lab owner, auditor handling real receipts.

---

## Troubleshooting

### "Launch demo lab" did nothing
You're likely on a stale browser tab from before a recent client deploy. Hard refresh (Cmd+Shift+R / Ctrl+Shift+R) and try again. As of the current build, the client also auto-reloads stale tabs on tab focus by comparing its own JS bundle hash against `bundleHash` in `/api/status`.

### "Couldn't reach the lab backend"
The sandbox cold-started. The client retries automatically (3 attempts, 600ms then 1500ms backoff). If it still fails after a few seconds, wait 10 seconds and click again.

### Login looks like it worked but bounces back to `/`
You're in an embedded preview iframe (e.g. inside a chat window) that blocks third-party cookies. Open `https://aigovops-beacon-lab.pplx.app` in a full browser tab and try again.

### Admin password rejected
The global anti-brute-force counter caps at 30 failed admin login attempts per 15-minute window across all clients (the pplx.app proxy collapses many real clients into one upstream IP, so per-IP limits aren't safe). A successful login from anyone resets the counter immediately.

---

## See also

- [`lab-service/README.md`](../lab-service/README.md) — the live lab's repo readme.
- [`lab-service/docs/alternative-backends.md`](../lab-service/docs/alternative-backends.md) — how to redeploy the same backend on Fly.io, Cloud Run, Cloudflare Workers, or DigitalOcean.
- [`docs/lab.html`](./lab.html) — the static Framework Lab landing page (this is the page that pointed you here).
- [`docs/AUDITOR_WORKSHOP.md`](./AUDITOR_WORKSHOP.md) — facilitator playbook for 90-minute in-person workshops.
