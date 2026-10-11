# Production Readiness — Rego policy
#
# Compiled by Beacon's gate engine. Input shape:
#
#   input = {
#     "model": { "id", "vendor", "model", "version", "owner", "trust_tier_target" },
#     "checklist_scores": { "<pack-id>": <0..1> },
#     "native": { "NAT-1": bool, "NAT-2": bool, ... },
#     "signatures_valid": bool,
#     "dual_control_present": bool,
#     "applicable_packs": [ "<pack-id>", ... ]
#   }
#
# Output: data.beacon.gate.production_readiness.decision

package beacon.gate.production_readiness

import future.keywords.if
import future.keywords.in

default decision := {
    "result": "FAIL",
    "reasons": ["evaluation did not run"],
}

# ─── Thresholds by target tier ────────────────────────────────────────────

thresholds := {
    "T1": {
        "nist-ai-rmf": 0.50,
        "iso-iec-42001": 0.40,
        "human-flourishing": 0.00,
        "require_signatures": false,
        "require_dual_control": false,
    },
    "T2": {
        "nist-ai-rmf": 0.75,
        "iso-iec-42001": 0.70,
        "eu-ai-act-art13": 0.85,
        "hipaa-for-ai": 0.95,
        "human-flourishing": 0.50,
        "require_signatures": true,
        "require_dual_control": false,
    },
    "T3": {
        "nist-ai-rmf": 0.90,
        "iso-iec-42001": 0.85,
        "eu-ai-act-art13": 0.95,
        "hipaa-for-ai": 1.00,
        "human-flourishing": 1.00,
        "require_signatures": true,
        "require_dual_control": true,
    },
}

tier := input.model.trust_tier_target

tier_thresholds := thresholds[tier]

# ─── Native critical checks ───────────────────────────────────────────────

native_critical_failures contains id if {
    some id
    id in ["NAT-1", "NAT-2", "NAT-3"]
    input.native[id] == false
}

# ─── Checklist threshold failures ─────────────────────────────────────────

checklist_failures contains msg if {
    some pack
    pack in input.applicable_packs
    threshold := tier_thresholds[pack]
    threshold != null
    score := input.checklist_scores[pack]
    score < threshold
    msg := sprintf("%s scored %.2f, threshold is %.2f for %s", [pack, score, threshold, tier])
}

# ─── Signature requirement ────────────────────────────────────────────────

signature_failure contains "signatures invalid or missing" if {
    tier_thresholds.require_signatures == true
    input.signatures_valid == false
}

# ─── Dual-control requirement (T3 promotions) ─────────────────────────────

dual_control_failure contains "dual control required for T3 but not present" if {
    tier_thresholds.require_dual_control == true
    input.dual_control_present == false
}

# ─── Compose decision ─────────────────────────────────────────────────────

all_reasons := array.concat(
    array.concat(
        array.concat(
            [r | r := sprintf("native critical check failed: %s", [id]); id := native_critical_failures[_]],
            [m | m := checklist_failures[_]],
        ),
        [s | s := signature_failure[_]],
    ),
    [d | d := dual_control_failure[_]],
)

decision := {
    "result": "PASS",
    "reasons": [],
    "tier_target": tier,
} if {
    count(all_reasons) == 0
}

decision := {
    "result": "FAIL",
    "reasons": all_reasons,
    "tier_target": tier,
} if {
    count(all_reasons) > 0
}
