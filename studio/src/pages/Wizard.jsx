import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Stepper from "../components/Stepper.jsx";
import { api } from "../lib/api.js";

// The five-step wizard. Each step is a small, deliberate question.
// The microcopy is the product. Don't trim it.

export default function Wizard() {
  const [step, setStep] = useState(1);
  const [version, setVersion] = useState(null);
  const [networkName, setNetworkName] = useState("");
  const [discovered, setDiscovered] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [selectedInventoryId, setSelectedInventoryId] = useState(null);
  const [selectedPacks, setSelectedPacks] = useState([
    "nist-ai-rmf",
    "human-flourishing",
  ]);
  const [gateResult, setGateResult] = useState(null);
  const [bundle, setBundle] = useState(null);

  useEffect(() => {
    api.version().then(setVersion).catch(() => {});
  }, []);

  return (
    <main className="shell">
      <p className="kicker">AIGovOps Foundation · Beacon Studio v{version?.version ?? "—"}</p>
      <h1>Let's find out what's running on your network.</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        Five steps. We'll show you every AI model your people are using,
        what guardrails apply, and a checklist you can sign — or hand to
        your engineer to sign for you. No PDFs at the end. A real
        receipt.
      </p>

      <Stepper current={step} />

      {step === 1 && (
        <Step1 onNext={(name) => { setNetworkName(name); setStep(2); }} />
      )}
      {step === 2 && (
        <Step2
          networkName={networkName}
          discovered={discovered}
          onDiscovered={(d) => setDiscovered(d)}
          onNext={async () => {
            const inv = await api.inventory();
            setInventory(inv);
            setStep(3);
          }}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <Step3
          inventory={inventory}
          selected={selectedInventoryId}
          onSelect={setSelectedInventoryId}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Step4
          selectedPacks={selectedPacks}
          setSelectedPacks={setSelectedPacks}
          onBack={() => setStep(3)}
          onNext={async () => {
            const r = await api.runGate({
              inventory_id: selectedInventoryId,
              applicable_packs: selectedPacks,
            });
            setGateResult(r);
            setStep(5);
          }}
        />
      )}
      {step === 5 && (
        <Step5
          gateResult={gateResult}
          bundle={bundle}
          onExport={async () => {
            const b = await api.exportBundle({
              inventory_id: selectedInventoryId,
            });
            setBundle(b);
          }}
          onBack={() => setStep(4)}
        />
      )}
    </main>
  );
}

// ─── Step 1 ──────────────────────────────────────────────────────────────
function Step1({ onNext }) {
  const [name, setName] = useState("");
  return (
    <section className="card stack">
      <p className="kicker">Step 1 of 5</p>
      <h2>What network are we looking at?</h2>
      <p className="muted">
        A label, in your own words. "Marketing org," "the hospital,"
        "everything in us-east-1." We'll attach this to the audit so
        future-you knows what past-you meant.
      </p>
      <label>Network name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Marketing org · production"
      />
      <div className="row between">
        <span className="muted">Nothing leaves your machine yet.</span>
        <button
          className="btn-primary"
          disabled={name.trim().length < 2}
          onClick={() => onNext(name.trim())}
        >
          Next: see what's running →
        </button>
      </div>
    </section>
  );
}

// ─── Step 2 ──────────────────────────────────────────────────────────────
function Step2({ networkName, discovered, onDiscovered, onNext, onBack }) {
  const [csv, setCsv] = useState(
    "vendor,model,version,environment\nOpenAI,gpt-4o-mini,2024-07-18,production\n"
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await api.discover("manual_csv", { content: csv });
      onDiscovered(r);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <p className="kicker">Step 2 of 5 · {networkName}</p>
      <h2>Here's what Beacon found.</h2>
      <p className="muted">
        Paste a CSV of what you already know, or point Beacon at a proxy
        log on the server. The Control Plane has the proxy-log option;
        this wizard uses the CSV path so you can move fast.
      </p>
      <label>CSV — vendor, model, version, environment</label>
      <textarea value={csv} onChange={(e) => setCsv(e.target.value)} />
      <div className="row between">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <div className="row">
          <button className="btn-ghost" onClick={run} disabled={busy}>
            {busy ? "Scanning…" : "Scan"}
          </button>
          <button
            className="btn-primary"
            onClick={onNext}
            disabled={!discovered}
          >
            Next: pick what matters →
          </button>
        </div>
      </div>
      {err && <div className="pill fail">Error: {err}</div>}
      {discovered && (
        <div className="banner">
          <span className="dot" />
          <div>
            <strong>{discovered.scanned}</strong> model row(s) read.{" "}
            <strong>{discovered.new_inventory_rows}</strong> new,{" "}
            <strong>{discovered.touched_inventory_rows}</strong> already
            in inventory. Every row produced a signed discovery receipt.
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Step 3 ──────────────────────────────────────────────────────────────
function Step3({ inventory, selected, onSelect, onNext, onBack }) {
  return (
    <section className="card stack">
      <p className="kicker">Step 3 of 5</p>
      <h2>Which one do you want to audit first?</h2>
      <p className="muted">
        Start with the most consequential model on your inventory. You
        can run the wizard again for the rest — Beacon remembers.
      </p>
      <div className="stack-tight">
        {inventory.length === 0 && (
          <p className="muted">No inventory yet. Go back and scan.</p>
        )}
        {inventory.map((row) => (
          <label
            key={row.id}
            className="row"
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: selected === row.id ? "var(--hydra-teal-soft)" : "white",
              cursor: "pointer",
            }}
          >
            <input
              type="radio"
              name="inv"
              checked={selected === row.id}
              onChange={() => onSelect(row.id)}
              style={{ width: "auto", marginRight: "0.75rem" }}
            />
            <span>
              <strong>{row.vendor}</strong> · {row.model}{" "}
              <span className="muted">v{row.version}</span>
              <span className="pill" style={{ marginLeft: "0.5rem" }}>
                {row.environment}
              </span>
              <span className="pill" style={{ marginLeft: "0.35rem" }}>
                tier {row.trust_tier}
              </span>
            </span>
          </label>
        ))}
      </div>
      <div className="row between">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={!selected}
        >
          Next: pick guardrails →
        </button>
      </div>
    </section>
  );
}

// ─── Step 4 ──────────────────────────────────────────────────────────────
function Step4({ selectedPacks, setSelectedPacks, onNext, onBack }) {
  const [packs, setPacks] = useState([]);
  useEffect(() => {
    api.checklists().then(setPacks);
  }, []);

  function toggle(id) {
    setSelectedPacks((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );
  }

  return (
    <section className="card stack">
      <p className="kicker">Step 4 of 5</p>
      <h2>Which guardrails apply to this model?</h2>
      <p className="muted">
        Pick all that apply. The Foundation's Human Flourishing pack is
        on by default — it's the question your auditor will not ask but
        wishes you had.
      </p>
      <div className="stack-tight">
        {packs.map((p) => (
          <label
            key={p.id}
            className="row"
            style={{
              padding: "0.75rem 1rem",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              background: selectedPacks.includes(p.id)
                ? "var(--hydra-teal-soft)"
                : "white",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={selectedPacks.includes(p.id)}
              onChange={() => toggle(p.id)}
              style={{ width: "auto", marginRight: "0.75rem" }}
            />
            <span style={{ flex: 1 }}>
              <strong>{p.short_title}</strong>{" "}
              <span className="muted">{p.authority}</span>
              <div className="muted" style={{ fontSize: "0.9rem" }}>
                {p.title} · {p.item_count} items
              </div>
            </span>
          </label>
        ))}
      </div>
      <div className="row between">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button
          className="btn-primary"
          onClick={onNext}
          disabled={selectedPacks.length === 0}
        >
          Run the gate →
        </button>
      </div>
    </section>
  );
}

// ─── Step 5 ──────────────────────────────────────────────────────────────
function Step5({ gateResult, bundle, onExport, onBack }) {
  if (!gateResult) {
    return (
      <section className="card">
        <p className="muted">Running the gate…</p>
      </section>
    );
  }
  const pass = gateResult.result === "PASS";
  return (
    <section className="card stack">
      <p className="kicker">Step 5 of 5 · here's your audit</p>
      <h2>
        Gate{" "}
        <span className={`pill ${pass ? "pass" : "fail"}`}>
          {gateResult.result}
        </span>{" "}
        for tier {gateResult.tier_target}
      </h2>
      {!pass && (
        <>
          <p className="muted">
            Nothing scary — this is what the auditor would have asked
            anyway. Fix these or attach evidence:
          </p>
          <ul>
            {gateResult.reasons.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      <p className="muted">
        Decision receipt: <code className="evidence">{gateResult.receipt_id}</code>
      </p>
      <div className="banner">
        <span className="dot" />
        <div>
          Generate a verifiable audit bundle to send to whomever asks.
          It includes the receipts, the policies in force, and a one-page
          <code className="evidence" style={{ marginLeft: "0.25rem" }}>VERIFY.md</code>{" "}
          your engineer can run without Beacon installed.
        </div>
      </div>
      <div className="row between">
        <button className="btn-ghost" onClick={onBack}>← Back</button>
        <button className="btn-primary" onClick={onExport}>
          Generate audit bundle
        </button>
      </div>
      {bundle && (
        <div className="card" style={{ background: "var(--paper-soft)" }}>
          <p className="kicker">Bundle ready</p>
          <p>
            Path: <code className="evidence">{bundle.bundle_path}</code>
          </p>
          <p>
            Manifest SHA-256:{" "}
            <code className="evidence">{bundle.manifest_sha256}</code>
          </p>
          <p>
            Verified{" "}
            <strong>{bundle.verification.receipts_verified}</strong>{" "}
            receipt(s), failed{" "}
            <strong>{bundle.verification.receipts_failed}</strong>.
          </p>
          <p>
            <Link to="/control">Open the Control Plane</Link> to inspect
            individual receipts or share the bundle.
          </p>
        </div>
      )}
    </section>
  );
}
