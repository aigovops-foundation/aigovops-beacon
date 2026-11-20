# OVERT liaison — draft agent brief

## Purpose

Help Beacon and CHAI track [OVERT](https://overt.is/) releases, errata, and the Protocol Profile Registry. Map Beacon receipts against OVERT 1.1 and Protocol Profile 1.0. Draft answers to implementer questions, citing the applicable version and section numbers.

## Draft outputs

- **Replies for Ken Johnston:** Answer what the public sources establish. Mark unverified availability, links, and release dates as “not checked.”
- **Mapping notes file:** Record the Beacon schema version and field, the OVERT section, and whether the field aligns, differs, or is not checked. Use synthetic or approved redacted examples. Beacon [receipts](../docs/RECEIPT_SCHEMA.md) use JSON with JCS (RFC 8785) for signing; Profile 1.0's base envelope uses deterministic CBOR (Annex B.3 and B.6). Describe supported mappings as **OVERT-aligned**, not as meeting a profile's requirements. Keep Beacon's [proposed profile](../docs/PROFILE_REGISTRATION.md) distinct from Profile 1.0.
- **Release-watch log:** Record the check date, URLs, version, and confirmed changes. Start with the [OVERT release feed](https://overt.is/feed.json), version history, and governance page. Track whether a public Registry URL, the profile, and its vectors can each be verified.

## Source notes

Use the published [OVERT 1.1 standard](https://overt.is/OVERT_v1.1_STANDARD.md). Annex B is an informative reference summary; §17.6 makes the declared profile binding for the implementation. §22.6.1 requires a stable Registry URL, and §22.6.2 requires published cryptographic test vectors for registered profiles.

**Availability check, 20 November 2026:** No public Registry URL was found in the OVERT pages and release listings checked. Annex B.12 says the reference test vectors are in the Protocol Profile 1.0 document and directs implementers to the Registry. Whether implementers can obtain the document and vectors now, or when they will be released, is **not checked**. The named contact for Ken to ask is `overt-review@glacis.io`.

## Human gates

Ken Johnston and Bob Rapp both review this brief. Ken approves anything external; Bob approves repository changes and merges. The liaison never sends mail, publishes drafts, or speaks for Glacis, CHAI, or AiGovOps. Check the [OVERT governance page](https://overt.is/governance) before describing any stewardship change as in effect. Never claim conformance or certification, guess at availability, or invent a date.
