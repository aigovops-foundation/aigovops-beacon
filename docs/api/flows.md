# Beacon Flows

How a receipt travels through Beacon — from the moment an event is observed to
the moment a downstream consumer (Lantern) reads it back and trusts it.

Each stage is small and inspectable. Together they form an unbroken,
cryptographically verifiable chain:

> **observe → build → sign → bundle → anchor → consume**

The API surface for each stage is defined in [`openapi.yaml`](./openapi.yaml).
The action verbs that ride inside receipts are catalogued in
[`actions.md`](./actions.md).

---

## 1. Receipt creation and signing

A receipt starts life as a plain object describing something that happened: a
model was discovered, a gate was evaluated, an inference was observed. Beacon
canonicalizes the body (RFC 8785 JCS), hashes any sensitive payloads instead of
storing them raw (in the default `redacted` capture mode), and signs the
canonical bytes with its Ed25519 key. The signature block is appended; the
receipt is now tamper-evident.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Caller (CLI / SDK / Studio)
    participant API as Beacon API
    participant Svc as Receipt service
    participant Keys as Key store (Ed25519)
    participant DB as Receipt log (SQLite + NDJSON)

    Caller->>API: POST /api/v1/receipts (body + identity headers)
    API->>API: Validate fields (types, vendor enum, version != "latest")
    alt invalid input
        API-->>Caller: 400 { error } (structured envelope)
    else valid
        API->>Svc: build receipt
        Svc->>Svc: assign ULID id, ts_utc, schema_version
        Svc->>Svc: hash prompt/result (redacted) or keep raw (full)
        Svc->>Svc: canonicalize(body) per RFC 8785
        Svc->>Keys: sign(canonical bytes)
        Keys-->>Svc: sig_b64 + key_fpr
        Svc->>DB: append signed receipt (immutable)
        Svc-->>API: signed receipt
        API-->>Caller: 201 { receipt }
    end
```

**Verification** is the mirror image: strip the `signature` block, canonicalize
the remaining body, and check `sig_b64` against the active public key.

```mermaid
sequenceDiagram
    autonumber
    participant Caller
    participant API as Beacon API
    participant Keys as Key store

    Caller->>API: GET /api/v1/receipts/{id}/verify
    API->>API: load stored receipt
    API->>API: detach signature, canonicalize remainder
    API->>Keys: verify(sig_b64, canonical, key_fpr)
    Keys-->>API: ok / mismatch
    API-->>Caller: 200 { verified, key_fpr, reason? }
```

---

## 2. Bundle assembly

A bundle is a portable, append-only collection of receipts — one NDJSON line
per receipt — plus a manifest that lists the included receipt ids and the public
key needed to verify them. Bundles are how evidence leaves Beacon as a single
self-contained artifact.

```mermaid
sequenceDiagram
    autonumber
    participant Caller
    participant API as Beacon API
    participant Exp as Export service
    participant DB as Receipt log

    Caller->>API: POST /api/v1/export (filter: ids / time range)
    API->>Exp: gather matching receipts
    Exp->>DB: stream receipts (never load whole corpus into memory)
    DB-->>Exp: receipts (one at a time)
    Exp->>Exp: write canonical NDJSON line per receipt
    Exp->>Exp: build manifest (count, key_fpr, public key, digest)
    Exp-->>API: bundle { manifest, ndjson }
    API-->>Caller: 200 { bundle }
```

The bundle digest covers the manifest, so any change to the included receipts or
the key reference is detectable before a consumer even verifies individual
signatures.

---

## 3. Anchoring

Anchoring publishes the bundle digest to an external, harder-to-rewrite medium
(for example a transparency log or a timestamping authority). It does not move
the receipts themselves — only a commitment to their content — so anchoring is
cheap and leaks nothing. A `bundle.anchored` receipt records where the anchor
landed, closing the loop back into the receipt log.

```mermaid
sequenceDiagram
    autonumber
    participant Operator
    participant API as Beacon API
    participant Anchor as External anchor (transparency log)
    participant DB as Receipt log

    Operator->>API: anchor(bundle digest)
    API->>Anchor: submit digest
    Anchor-->>API: anchor reference (log id, inclusion proof)
    API->>DB: append bundle.anchored receipt (refs digest + proof)
    API-->>Operator: 200 { anchor_ref }
```

Anchoring is optional. An un-anchored bundle is still fully verifiable against
the embedded public key; anchoring adds independent proof of *when* the bundle
existed.

---

## 4. Consumption by Lantern

Lantern is a downstream consumer that reads bundles and renders the governance
story they tell. It never has to trust Beacon's word: it re-verifies every
signature against the key in the manifest, and — if an anchor is present — checks
the inclusion proof against the external log.

```mermaid
sequenceDiagram
    autonumber
    participant Lantern
    participant Bundle as Bundle (NDJSON + manifest)
    participant Anchor as External anchor

    Lantern->>Bundle: read manifest (count, key_fpr, public key, digest)
    Lantern->>Lantern: recompute bundle digest, compare to manifest
    loop each receipt line
        Lantern->>Lantern: detach signature, canonicalize remainder
        Lantern->>Lantern: verify sig_b64 against manifest public key
    end
    opt anchored
        Lantern->>Anchor: fetch inclusion proof for digest
        Anchor-->>Lantern: proof
        Lantern->>Lantern: verify proof
    end
    Lantern->>Lantern: reconstruct timeline by ULID order
    Lantern-->>Lantern: render verified governance view
```

Because receipt ids are ULIDs, Lantern can reconstruct an accurate chronological
timeline by sorting ids alone — no separate ordering metadata required.

---

## End-to-end at a glance

```mermaid
flowchart LR
    A[Event observed] --> B[Receipt built + hashed]
    B --> C[Canonicalize + Ed25519 sign]
    C --> D[Append to receipt log]
    D --> E[Assemble bundle + manifest]
    E --> F[Anchor digest externally]
    E --> G[Lantern consumes + re-verifies]
    F --> G
```

Every arrow above is verifiable after the fact: the signature proves *what*, the
ULID proves *when (order)*, the manifest proves *which set*, and the anchor
proves *no later than*.
