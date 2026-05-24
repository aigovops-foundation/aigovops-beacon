/**
 * Beacon Lab — Seed Data
 * Two demo tenants with realistic-but-fictional AI program inventories.
 * Tenants are reset every time the lab starts, so trainees see a clean slate.
 */
import { storage } from "./storage";
import { generateEd25519, ulid, hashPassword } from "./crypto";

export interface TenantSeed {
  id: string;
  name: string;
  description: string;
  ein: string;
  inventory: Array<{
    name: string;
    vendor: string;
    model: string;
    version: string;
    useCase: string;
    riskTier: "low" | "medium" | "high" | "prohibited";
    status: "draft" | "approved" | "retired";
    ownerEmail: string;
    controlRefs: string[];
    metadata: Record<string, unknown>;
  }>;
}

export const TENANT_SEEDS: TenantSeed[] = [
  {
    id: "aigovops-foundation",
    name: "AIGovOps Foundation",
    description:
      "Open-source 501(c)(3) advancing community-owned AI governance standards. Demo inventory only — not real Foundation policy.",
    ein: "99-0000001",
    inventory: [
      {
        name: "Grant Application Triage",
        vendor: "OpenAI",
        model: "gpt-4o",
        version: "2024-08-06",
        useCase:
          "Pre-screens incoming community grant applications against eligibility checklist; flags items for human reviewer.",
        riskTier: "medium",
        status: "approved",
        ownerEmail: "grants@aigovops.org",
        controlRefs: ["NIST-AI-RMF:GOVERN-1.1", "NIST-AI-RMF:MAP-2.3", "EU-AI-Act:Art.10"],
        metadata: {
          dataset: "anonymized-grant-apps-2024",
          piiHandling: "redacted-before-prompt",
          humanReviewRequired: true,
        },
      },
      {
        name: "Volunteer Match Recommender",
        vendor: "Anthropic",
        model: "claude-sonnet-4",
        version: "20250514",
        useCase: "Matches volunteer skills to open community projects.",
        riskTier: "low",
        status: "approved",
        ownerEmail: "community@aigovops.org",
        controlRefs: ["NIST-AI-RMF:MEASURE-2.7"],
        metadata: { dataset: "volunteer-skills-public", optInOnly: true },
      },
      {
        name: "Educational Content Summarizer",
        vendor: "Google",
        model: "gemini-1.5-pro",
        version: "002",
        useCase: "Summarizes workshop transcripts into learner-facing recap notes.",
        riskTier: "low",
        status: "approved",
        ownerEmail: "education@aigovops.org",
        controlRefs: ["NIST-AI-RMF:MEASURE-2.11"],
        metadata: { dataset: "workshop-transcripts-public" },
      },
      {
        name: "Donor Sentiment Scorer (DRAFT)",
        vendor: "OpenAI",
        model: "gpt-4o-mini",
        version: "2024-07-18",
        useCase:
          "Scores donor outreach replies as positive/neutral/negative for follow-up prioritization.",
        riskTier: "high",
        status: "draft",
        ownerEmail: "development@aigovops.org",
        controlRefs: ["NIST-AI-RMF:GOVERN-2.1"],
        metadata: {
          dataset: "donor-replies",
          piiHandling: "NOT-CONFIGURED",
          // Intentionally non-compliant — used as Lab 200 failure case.
          biasAssessment: "PENDING",
          dpiaCompleted: false,
        },
      },
      {
        name: "Board Meeting Minute Drafting",
        vendor: "Anthropic",
        model: "claude-opus-4",
        version: "20250514",
        useCase: "Drafts board meeting minutes from human-confirmed transcript.",
        riskTier: "medium",
        status: "approved",
        ownerEmail: "boardops@aigovops.org",
        controlRefs: ["NIST-AI-RMF:GOVERN-1.5", "ISO-42001:6.2"],
        metadata: { dataset: "board-transcripts-internal", humanApprovalRequired: true },
      },
    ],
  },
  {
    id: "beacon-foundation-inc",
    name: "Beacon Foundation Inc.",
    description:
      "Fictional 501(c)(3) used purely for training. Any resemblance to a real organization is coincidental.",
    ein: "99-0000002",
    inventory: [
      {
        name: "Lighthouse Tutor Chatbot",
        vendor: "OpenAI",
        model: "gpt-4o",
        version: "2024-08-06",
        useCase:
          "Answers learner questions about Beacon Foundation curriculum (math + reading levels).",
        riskTier: "medium",
        status: "approved",
        ownerEmail: "edtech@beaconfoundation.example",
        controlRefs: ["NIST-AI-RMF:GOVERN-4.1", "EU-AI-Act:Art.6-AnnexIII"],
        metadata: {
          dataset: "curriculum-2025-q3",
          studentDataInPrompt: false,
          ageGroup: "K-12",
        },
      },
      {
        name: "Scholarship Eligibility Pre-Check",
        vendor: "Anthropic",
        model: "claude-sonnet-4",
        version: "20250514",
        useCase:
          "Pre-checks scholarship applications against published eligibility rules; always human-confirmed.",
        riskTier: "high",
        status: "approved",
        ownerEmail: "scholarships@beaconfoundation.example",
        controlRefs: ["NIST-AI-RMF:GOVERN-1.1", "EU-AI-Act:Art.6-AnnexIII"],
        metadata: {
          biasAssessment: "completed-2025-04",
          humanApprovalRequired: true,
          appealProcess: "documented",
        },
      },
      {
        name: "Donor Outreach Personalizer",
        vendor: "OpenAI",
        model: "gpt-4o-mini",
        version: "2024-07-18",
        useCase: "Generates first-draft outreach emails. Marketing reviews before send.",
        riskTier: "low",
        status: "approved",
        ownerEmail: "marketing@beaconfoundation.example",
        controlRefs: ["NIST-AI-RMF:MEASURE-2.7"],
        metadata: { dataset: "donor-history-internal", humanReviewRequired: true },
      },
      {
        name: "AutoApprove Grant Allocator (BLOCKED)",
        vendor: "OpenAI",
        model: "gpt-4o",
        version: "2024-08-06",
        useCase: "Proposed: automatically allocates grant dollars between programs.",
        riskTier: "prohibited",
        status: "retired",
        ownerEmail: "former-cfo@beaconfoundation.example",
        controlRefs: ["NIST-AI-RMF:GOVERN-1.1"],
        metadata: {
          blockedReason: "No human-in-the-loop on irreversible financial decisions.",
          // Used as Lab 200 case study of a prohibited use case.
        },
      },
      {
        name: "Volunteer Hours Anomaly Detection",
        vendor: "Google",
        model: "gemini-1.5-flash",
        version: "002",
        useCase: "Flags volunteer-hour submissions that look statistically anomalous for HR review.",
        riskTier: "medium",
        status: "approved",
        ownerEmail: "hr@beaconfoundation.example",
        controlRefs: ["NIST-AI-RMF:MEASURE-2.5"],
        metadata: { dataset: "volunteer-logs-2024", thresholds: "weekly_recalibrated" },
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export function bootstrap(adminPassword: string) {
  // Admin state
  const existingAdmin = storage.getAdminState();
  if (!existingAdmin) {
    const { hash, salt } = hashPassword(adminPassword);
    storage.setAdminState({
      id: "singleton",
      paused: false,
      pauseMessage: "Lab is paused. Please wait for instructor.",
      passwordHash: hash,
      passwordSalt: salt,
      updatedAt: new Date(),
    });
    console.log("[seed] Admin state initialized.");
  } else {
    console.log("[seed] Admin state already exists; not overwriting.");
  }

  // Tenants (signing keys persist across restarts)
  for (const seed of TENANT_SEEDS) {
    const existing = storage.getTenant(seed.id);
    if (!existing) {
      const kp = generateEd25519();
      storage.upsertTenant({
        id: seed.id,
        name: seed.name,
        description: seed.description,
        ein: seed.ein,
        signingPublicKey: kp.publicKeyB64,
        signingPrivateKey: kp.privateKeyB64,
        keyFingerprint: kp.fingerprint,
        createdAt: new Date(),
      });
      console.log(`[seed] Created tenant ${seed.id} (fpr=${kp.fingerprint}).`);
    }
    // Inventory: seed if empty
    if (storage.listInventory(seed.id).length === 0) {
      for (const item of seed.inventory) {
        storage.createInventoryItem({
          id: ulid(),
          tenantId: seed.id,
          name: item.name,
          vendor: item.vendor,
          model: item.model,
          version: item.version,
          useCase: item.useCase,
          riskTier: item.riskTier,
          status: item.status,
          ownerEmail: item.ownerEmail,
          controlRefs: item.controlRefs,
          metadata: item.metadata,
          createdAt: new Date(),
        });
      }
      console.log(`[seed] Seeded ${seed.inventory.length} inventory items for ${seed.id}.`);
    }
  }
}

export function reseedTenantInventory(tenantId: string) {
  const seed = TENANT_SEEDS.find((s) => s.id === tenantId);
  if (!seed) return;
  storage.resetInventory(tenantId);
  for (const item of seed.inventory) {
    storage.createInventoryItem({
      id: ulid(),
      tenantId: seed.id,
      name: item.name,
      vendor: item.vendor,
      model: item.model,
      version: item.version,
      useCase: item.useCase,
      riskTier: item.riskTier,
      status: item.status,
      ownerEmail: item.ownerEmail,
      controlRefs: item.controlRefs,
      metadata: item.metadata,
      createdAt: new Date(),
    });
  }
}
