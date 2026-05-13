# beacon-studio

The front door. A five-step wizard for non-technical auditors, plus a
Control Plane for engineers.

## Run it

```bash
cd studio
npm install
npm run dev          # http://localhost:5173
```

Make sure the server is running on `127.0.0.1:8787` first
(`cd ../server && npm start`). The Vite dev server proxies `/api`.

## Build for production

```bash
npm run build        # writes ./dist
```

Serve `dist/` from any static host — or behind the same OIDC proxy as
the API, which is the recommended deployment.

## What lives where

```
src/
  main.jsx
  App.jsx
  pages/
    Wizard.jsx        five-step auditor flow
    ControlPlane.jsx  inventory · receipts · checklists tables
  components/
    Stepper.jsx       step indicator
  lib/
    api.js            typed wrapper around /api/v1
  styles/
    theme.css         AIGovOps Nexus palette + base type
```

## Design choices we will defend

- Body type is 16px. Sixteen.
- The wizard has five steps. Not four, not six. The labels are short
  enough to read on a phone.
- Every button that takes an action says what the action will be —
  "Run the gate," "Generate audit bundle." Never "Submit."
- The Control Plane shows raw receipt IDs and lets anyone press
  "verify" on any one of them. Auditors get the same screen power
  users do.
