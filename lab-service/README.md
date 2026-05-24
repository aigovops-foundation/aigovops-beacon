# AIGovOps Beacon — Lab Service

Live training lab for the Beacon evidence pipeline. Two demo tenants
(AIGovOps Foundation 501(c)(3) — fictional inventory only — and the
fictional Beacon Foundation Inc.) let trainees:

- **Lab 100** — discover an AI program inventory, run a baseline 5-rule
  checklist, bundle the resulting OVERT 1.0 receipts into a Merkle-rooted
  Ed25519-signed evidence pack, and verify everything.
- **Lab 200** — extend to a 9-rule checklist (human-in-the-loop, bias,
  DPIA, PII handling), apply a `design.modified` fix to a failing item,
  and author Policy-as-Code rules in JSON.

The instructor controls the lab with a password-protected admin console:
**pause/resume**, **reset trainee data**, **rotate password**, and **issue
single-use magic-link sign-ins** for trainees.

## Architecture

```
client/        Vite + React + TS + Tailwind + shadcn/ui  (hash routing)
server/        Express 5 + Drizzle ORM + better-sqlite3
shared/        Drizzle schema + Zod validators
```

- All signatures use Node's built-in Ed25519 (no external crypto deps).
- JSON canonicalization follows RFC 8785 (JCS).
- Each tenant has its own Ed25519 key pair (generated at first boot,
  persists in `data.db`).
- Sessions are in-memory tokens (no cookies — works in sandboxed iframes).

## Local development

```bash
cd lab-service
npm install
ADMIN_PASSWORD=mysecret LAB_NAME="Beacon Lab" npm run dev
```

Visit `http://localhost:5000`. The admin console is at the same URL; sign
in via the **Admin** tab.

## Environment variables

| Var               | Default                       | Purpose                              |
|-------------------|-------------------------------|--------------------------------------|
| `ADMIN_PASSWORD`  | `beacon`                      | Admin password (set on first boot).  |
| `LAB_NAME`        | `AIGovOps Beacon Lab`         | Banner shown to trainees.            |
| `NODE_ENV`        | (unset)                       | Set to `production` for prod build.  |

After first boot, the admin password is stored hashed in `data.db` and
the env var is no longer needed. Rotate from the Admin → Security tab.

## Pause / resume

When the lab is paused, every trainee API call returns
`503 {"error":"paused","message":"…"}`. The lab UI displays the message
banner and freezes; admin sessions bypass the pause so the instructor
can resume cleanly.

For zero-cost downtime between sessions, simply unpublish the deployment;
the SQLite data persists at the publisher level.

## Magic-link auth (no email service required)

The admin issues a single-use, TTL-limited token per trainee and either
copies the link or opens their own mail client via a pre-filled
`mailto:`. The trainee opens the link, clicks **Enter the lab**, and is
signed in. Tokens are consumed on first redemption.

## Receipts and bundles

Every action produces an OVERT 1.0 receipt under profile
`aigovops-beacon.v1`. Bundles are Merkle-rooted SHA-256 trees over the
RFC-8785-canonicalized form of each receipt and signed with the tenant's
Ed25519 key. The lab can verify both individual receipts and complete
bundles end-to-end from the **My evidence** tab.

## Tenants

| Tenant ID                | Name                    | Notes                                  |
|--------------------------|-------------------------|----------------------------------------|
| `aigovops-foundation`    | AIGovOps Foundation     | 501(c)(3). Demo inventory only.        |
| `beacon-foundation-inc`  | Beacon Foundation Inc.  | Fully fictional. Used for training.    |

Each tenant gets its own Ed25519 key pair. Public keys are exposed at
`/api/status` for auditor-side verification scripts.

## License

Apache-2.0.
