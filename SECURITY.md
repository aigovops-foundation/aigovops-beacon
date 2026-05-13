# Security

## Reporting a vulnerability

Email **security@aigovopsfoundation.org** (or, for now, open a private
security advisory on GitHub). Please do not file public issues for
unpatched vulnerabilities.

Expected response time:

- Acknowledgement: within 2 business days.
- Triage and severity assessment: within 5 business days.
- Fix or mitigation: depending on severity, within 14 to 60 days.

We will credit reporters in the release notes unless you ask us not to.

## What Beacon protects

- Tamper-evidence of receipts via Ed25519 signatures and an hourly
  Merkle anchor stream.
- OIDC-bound user identity on every receipt.
- Capture-mode controls so prompt and result content can be omitted or
  hashed rather than stored in the clear.

## What Beacon does not protect

- The integrity of the prompt or result before it reaches Beacon.
  Sign the request at the source if you need that property.
- The privacy of the prompt or result if `BEACON_CAPTURE_MODE=full`
  and the data directory is not encrypted.
- Anything if the signing key is exfiltrated. Treat
  `~/.beacon/keys/` like a CA private key.

## Hard rules

- Do not expose Beacon directly to the internet. Put OIDC in front.
- Do not run with `BEACON_CAPTURE_MODE=full` without explicit legal
  sign-off and at-rest encryption.
- Rotate signing keys at least every 90 days. The rotation receipt
  must be signed by a human at Trust Tier T3.
- Back up `~/.beacon/` daily. Test restore quarterly. A backup you
  have not restored is a wish.

## Cryptography choices

- Signing: Ed25519 (RFC 8032), via `tweetnacl`.
- Canonicalization: RFC 8785 JSON Canonicalization Scheme (JCS).
- Hashing: SHA-256 for prompt/result hashes and Merkle nodes.
- Key fingerprint: first 16 hex chars of SHA-256 over the raw 32-byte
  public key.

These choices were made for verifiability by any standards-compliant
implementation, not for novelty. We will not switch them without a
documented migration receipt.
