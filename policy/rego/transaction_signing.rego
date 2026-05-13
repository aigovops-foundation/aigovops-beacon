# Transaction Signing — Rego policy
#
# Evaluated on every receipt that Beacon writes. If this policy fails,
# the receipt is rejected before being appended to the daily NDJSON
# file. The caller gets HTTP 422 with the failing rule ids.
#
# Input shape:
#
#   input = {
#     "receipt": {
#       "id", "ts_utc", "schema_version",
#       "user": { "sub", "email", "oidc_issuer" },
#       "vendor", "model", "version",
#       "prompt"?, "prompt_hash"?,
#       "result"?, "result_hash"?,
#       "event_type", "environment",
#       "signature": {
#         "alg", "key_fpr", "sig_b64", "canonical_form"
#       }
#     },
#     "capture_mode": "hash_only" | "redacted" | "full",
#     "active_key_fpr": "<fingerprint>",
#     "signature_verifies": bool
#   }

package beacon.signing

import future.keywords.if
import future.keywords.in

default decision := {
    "result": "REJECT",
    "violations": ["evaluation did not run"],
}

# ─── Required fields on every receipt ─────────────────────────────────────

required_fields := [
    "id",
    "ts_utc",
    "schema_version",
    "vendor",
    "model",
    "version",
    "event_type",
    "environment",
    "signature",
]

missing_field contains f if {
    some f
    f in required_fields
    not input.receipt[f]
}

# ─── User identity must be OIDC-bound ─────────────────────────────────────

user_identity_violation contains "receipt missing OIDC-bound user.sub" if {
    not input.receipt.user.sub
}

user_identity_violation contains "receipt missing user.email" if {
    not input.receipt.user.email
}

user_identity_violation contains "receipt missing user.oidc_issuer" if {
    not input.receipt.user.oidc_issuer
}

# ─── Signature must be Ed25519 with current key ───────────────────────────

signature_violation contains "signature alg must be Ed25519" if {
    input.receipt.signature.alg != "Ed25519"
}

signature_violation contains "signature key fingerprint does not match active key" if {
    input.receipt.signature.key_fpr != input.active_key_fpr
}

signature_violation contains "signature does not verify against active public key" if {
    input.signature_verifies == false
}

signature_violation contains "canonical_form must be RFC 8785 JCS" if {
    input.receipt.signature.canonical_form != "RFC8785"
}

# ─── Capture-mode integrity ───────────────────────────────────────────────

capture_violation contains "hash_only mode must omit prompt and result" if {
    input.capture_mode == "hash_only"
    has_any([input.receipt.prompt, input.receipt.result])
}

capture_violation contains "hash_only mode requires prompt_hash and result_hash" if {
    input.capture_mode == "hash_only"
    not all_present([input.receipt.prompt_hash, input.receipt.result_hash])
}

capture_violation contains "redacted mode requires prompt_hash and result_hash" if {
    input.capture_mode == "redacted"
    not all_present([input.receipt.prompt_hash, input.receipt.result_hash])
}

# ─── Helpers ─────────────────────────────────────────────────────────────-

has_any(xs) if {
    some i
    xs[i] != null
    xs[i] != ""
}

all_present(xs) if {
    every x in xs {
        x != null
        x != ""
    }
}

# ─── Compose decision ─────────────────────────────────────────────────────

all_violations := array.concat(
    array.concat(
        array.concat(
            [sprintf("missing required field: %s", [f]) | f := missing_field[_]],
            [v | v := user_identity_violation[_]],
        ),
        [v | v := signature_violation[_]],
    ),
    [v | v := capture_violation[_]],
)

decision := {
    "result": "ACCEPT",
    "violations": [],
} if {
    count(all_violations) == 0
}

decision := {
    "result": "REJECT",
    "violations": all_violations,
} if {
    count(all_violations) > 0
}
