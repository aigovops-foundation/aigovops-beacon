import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import { api } from "../lib/api.js";

// The Control Plane is for power users. Everything the wizard does,
// plus the things the wizard hides.

export default function ControlPlane() {
  return (
    <main className="shell">
      <p className="kicker">Control Plane</p>
      <h1>For engineers, auditors, and the curious.</h1>
      <p className="muted" style={{ maxWidth: "60ch" }}>
        Inventory, receipts, checklists, gates, exports — exposed in
        their raw form. The wizard runs the same APIs. Nothing here is
        hidden from auditors.
      </p>

      <nav
        className="row"
        style={{ marginTop: "1.5rem", borderBottom: "1px solid var(--border)" }}
      >
        <NavTab to="/control" label="Inventory" end />
        <NavTab to="/control/receipts" label="Receipts" />
        <NavTab to="/control/checklists" label="Checklists" />
      </nav>

      <Routes>
        <Route index element={<InventoryView />} />
        <Route path="receipts" element={<ReceiptsView />} />
        <Route path="checklists" element={<ChecklistsView />} />
      </Routes>
    </main>
  );
}

function NavTab({ to, label, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      style={({ isActive }) => ({
        padding: "0.6rem 1rem",
        borderBottom: isActive ? "2px solid var(--hydra-teal)" : "2px solid transparent",
        color: isActive ? "var(--hydra-teal)" : "var(--ink-soft)",
        fontWeight: 500,
      })}
    >
      {label}
    </NavLink>
  );
}

function InventoryView() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.inventory().then(setRows);
  }, []);

  async function setTier(id, tier) {
    await api.setTier(id, tier);
    const r = await api.inventory();
    setRows(r);
  }

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th>Vendor</th>
            <th>Model</th>
            <th>Version</th>
            <th>Env</th>
            <th>Trust Tier</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td>{r.vendor}</td>
              <td>{r.model}</td>
              <td className="mono">{r.version}</td>
              <td><span className="pill">{r.environment}</span></td>
              <td>
                <select
                  value={r.trust_tier}
                  onChange={(e) => setTier(r.id, e.target.value)}
                  style={{ width: "auto" }}
                >
                  <option value="T0">T0</option>
                  <option value="T1">T1</option>
                  <option value="T2">T2</option>
                  <option value="T3">T3</option>
                </select>
              </td>
              <td className="mono muted">{r.last_seen_utc.slice(0, 19)}Z</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && (
        <p className="muted" style={{ marginTop: "1rem" }}>
          No inventory yet. Use the Studio or POST to /api/v1/discover.
        </p>
      )}
    </div>
  );
}

function ReceiptsView() {
  const [items, setItems] = useState([]);
  const [verifying, setVerifying] = useState(null);

  useEffect(() => {
    api.receipts({ limit: "200" }).then(setItems);
  }, []);

  async function verify(id) {
    setVerifying(id);
    const v = await api.verifyReceipt(id);
    alert(
      `Receipt ${id}\nSignature verifies: ${v.signature_verifies}\nKey: ${v.key_fpr}`
    );
    setVerifying(null);
  }

  return (
    <div style={{ marginTop: "1.25rem" }}>
      <p className="muted">Most recent first. Click "verify" to re-check the signature.</p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th>When</th>
            <th>Type</th>
            <th>User</th>
            <th>Model</th>
            <th>Receipt id</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.receipt_id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td className="mono muted">{r.ts_utc.slice(0, 19)}Z</td>
              <td><span className="pill">{r.event_type}</span></td>
              <td className="mono">{r.user_sub || "—"}</td>
              <td>{r.vendor && `${r.vendor} · ${r.model}`}</td>
              <td className="mono" style={{ fontSize: "0.8rem" }}>{r.receipt_id}</td>
              <td>
                <button
                  className="btn-ghost"
                  onClick={() => verify(r.receipt_id)}
                  disabled={verifying === r.receipt_id}
                  style={{ padding: "0.3em 0.7em" }}
                >
                  verify
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChecklistsView() {
  const [packs, setPacks] = useState([]);
  useEffect(() => { api.checklists().then(setPacks); }, []);
  return (
    <div style={{ marginTop: "1.25rem" }} className="stack-tight">
      {packs.map((p) => (
        <div key={p.id} className="card">
          <p className="kicker">{p.authority}</p>
          <h3 style={{ marginBottom: "0.25rem" }}>{p.title}</h3>
          <p className="muted">{p.item_count} items · v{p.version}</p>
          <a href={p.url} target="_blank" rel="noreferrer">{p.url}</a>
        </div>
      ))}
    </div>
  );
}
