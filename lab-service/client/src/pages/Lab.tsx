import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api, getToken, setToken, useApiCall, apiUrl } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Search, FileCheck2, Package, ShieldCheck, LogOut, CheckCircle2, XCircle, AlertTriangle,
  ScrollText, FileSignature, Sparkles, Wrench, Bug,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Me {
  session: { id: string; tenantId: string; label: string; role: string; isAdmin: boolean; expiresAt: string };
  tenant: { id: string; name: string; description: string; ein?: string; keyFingerprint: string; publicKey: string } | null;
}

export default function Lab() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [me, setMe] = useState<Me | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!getToken()) { navigate("/"); return; }
    api("GET", "/api/me").then(setMe).catch(() => { setToken(null); navigate("/"); });
    const interval = setInterval(() => {
      fetch(apiUrl("/api/status")).then((r) => r.json()).then((s) => setPaused(s.paused)).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!me) return <div className="p-8 text-muted-foreground">Loading…</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">AIGovOps Beacon Lab</h1>
              <p className="text-xs text-muted-foreground">
                <span data-testid="text-tenant">{me.tenant?.name ?? "—"}</span> · {me.session.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              key {me.tenant?.keyFingerprint.slice(0, 16)}…
            </Badge>
            <Button variant="outline" size="sm" onClick={async () => {
              try { await api("POST", "/api/logout"); } catch {}
              setToken(null); navigate("/");
            }} data-testid="button-logout">
              <LogOut className="size-4 mr-2" /> Log out
            </Button>
          </div>
        </div>
      </header>

      {paused && (
        <div className="bg-destructive text-destructive-foreground text-sm px-6 py-2 text-center">
          The lab is currently paused by the instructor. Please wait — your work is saved.
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 py-6">
        <Tabs defaultValue="lab100" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="lab100" data-testid="tab-lab100">Lab 100 — Foundations</TabsTrigger>
            <TabsTrigger value="lab200" data-testid="tab-lab200">Lab 200 — Deep dive</TabsTrigger>
            <TabsTrigger value="evidence" data-testid="tab-evidence">My evidence</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <Overview me={me} />
          </TabsContent>
          <TabsContent value="lab100">
            <Lab100 />
          </TabsContent>
          <TabsContent value="lab200">
            <Lab200 />
          </TabsContent>
          <TabsContent value="evidence">
            <EvidenceTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function Overview({ me }: { me: Me }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome to the Beacon Lab</CardTitle>
          <CardDescription>You are operating as a governance engineer for <strong>{me.tenant?.name}</strong>.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>This lab simulates the Beacon evidence pipeline against a fictional AI program inventory. Every action you take produces a cryptographically signed <strong>OVERT 1.0 receipt</strong> — the same envelope schema you'd ship in production.</p>
          <Separator />
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <div className="font-medium mb-1">Lab 100 — Foundations</div>
              <ul className="text-muted-foreground list-disc pl-5 space-y-1">
                <li>Discover the AI inventory.</li>
                <li>Run a baseline checklist (5 rules).</li>
                <li>Bundle receipts → verify signatures.</li>
              </ul>
            </div>
            <div>
              <div className="font-medium mb-1">Lab 200 — Deep dive</div>
              <ul className="text-muted-foreground list-disc pl-5 space-y-1">
                <li>Run extended checklist (9 rules).</li>
                <li>Fix a failing inventory item.</li>
                <li>Author Policy-as-Code and re-evaluate.</li>
              </ul>
            </div>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Signing key fingerprint: <code className="font-mono">{me.tenant?.keyFingerprint}</code>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lab 100
// ---------------------------------------------------------------------------

function Lab100() {
  const { toast } = useToast();
  const { data: inv, reload: reloadInv } = useApiCall<{ items: any[] }>(() => api("GET", "/api/inventory"), []);
  const [discoverReceipt, setDiscoverReceipt] = useState<any>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [bundle, setBundle] = useState<any>(null);

  async function discover() {
    try {
      const r = await api("POST", "/api/lab/discover");
      setDiscoverReceipt(r.receipt);
      toast({ title: "Discovery signed", description: `Receipt ${r.receipt.id.slice(0, 12)}… (${r.itemCount} items)` });
    } catch (e: any) {
      toast({ title: "Discover failed", description: e.message, variant: "destructive" });
    }
  }
  async function runChecklist() {
    try {
      const r = await api("POST", "/api/lab/checklist", { lab: "100", variant: "default" });
      setChecklist(r);
    } catch (e: any) {
      toast({ title: "Checklist failed", description: e.message, variant: "destructive" });
    }
  }
  async function makeBundle() {
    try {
      const r = await api("POST", "/api/lab/bundle", {});
      setBundle(r.bundle);
      toast({ title: "Bundle signed", description: `Merkle ${r.bundle.merkleRoot.slice(0, 12)}…` });
    } catch (e: any) {
      toast({ title: "Bundle failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="grid md:grid-cols-3 gap-6">
      <Step
        n={1} title="Discover inventory" icon={<Search className="size-5" />}
        action={<Button onClick={discover} className="w-full" data-testid="button-discover">Run discovery</Button>}
        body={
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Enumerate the AI systems your tenant has registered.
              The lab signs a <code>discovery.scan</code> receipt over the inventory digest.
            </p>
            <div className="text-xs text-muted-foreground mb-2">{inv?.items?.length ?? 0} items registered</div>
            <ScrollArea className="h-40 rounded border bg-muted/30 p-2">
              <ul className="text-xs space-y-1">
                {inv?.items?.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{i.name}</span>
                    <RiskBadge tier={i.riskTier} />
                  </li>
                ))}
              </ul>
            </ScrollArea>
            {discoverReceipt && <ReceiptCard receipt={discoverReceipt} />}
          </>
        }
      />
      <Step
        n={2} title="Evaluate checklist" icon={<FileCheck2 className="size-5" />}
        action={<Button onClick={runChecklist} className="w-full" data-testid="button-checklist-100">Run Level 100 checklist</Button>}
        body={
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Five baseline rules: tier present, version pinned, control mapped, owner present, prohibited not approved.
            </p>
            {checklist && <ChecklistView result={checklist.result} receipt={checklist.receipt} />}
          </>
        }
      />
      <Step
        n={3} title="Bundle & verify" icon={<Package className="size-5" />}
        action={<Button onClick={makeBundle} className="w-full" data-testid="button-bundle-100">Create signed bundle</Button>}
        body={
          <>
            <p className="text-sm text-muted-foreground mb-3">
              Bundles your session receipts into a Merkle-rooted, Ed25519-signed envelope — the artifact you'd hand to an auditor.
            </p>
            {bundle && <BundleView bundle={bundle} />}
          </>
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lab 200 — extended rules + fixer + Policy-as-Code
// ---------------------------------------------------------------------------

function Lab200() {
  const { toast } = useToast();
  const { data: inv, reload: reloadInv } = useApiCall<{ items: any[] }>(() => api("GET", "/api/inventory"), []);
  const [checklist, setChecklist] = useState<any>(null);

  async function runExtended() {
    try {
      const r = await api("POST", "/api/lab/checklist", { lab: "200", variant: "extended" });
      setChecklist(r);
    } catch (e: any) {
      toast({ title: "Checklist failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileCheck2 className="size-5" /> Extended checklist (9 rules)</CardTitle>
          <CardDescription>Adds human-in-the-loop, bias-assessment, DPIA, and PII-handling checks on top of the Level 100 ruleset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runExtended} data-testid="button-checklist-200">Run Level 200 checklist</Button>
          {checklist && <ChecklistView result={checklist.result} receipt={checklist.receipt} showItems />}
        </CardContent>
      </Card>

      <FixerCard items={inv?.items ?? []} onUpdate={reloadInv} />
      <PolicyAsCode onRun={() => reloadInv()} />
    </div>
  );
}

function FixerCard({ items, onUpdate }: { items: any[]; onUpdate: () => void }) {
  const { toast } = useToast();
  const failing = items.filter((i) => {
    const m = i.metadata ?? {};
    return (
      (i.riskTier === "high" && (m.biasAssessment === "PENDING" || m.dpiaCompleted !== true))
      || m.piiHandling === "NOT-CONFIGURED"
      || (i.riskTier === "prohibited" && i.status !== "retired")
    );
  });

  async function autoFix(i: any) {
    const patch: any = { metadata: { ...(i.metadata ?? {}) } };
    if (patch.metadata.biasAssessment === "PENDING") patch.metadata.biasAssessment = "completed-2025-05";
    if (patch.metadata.dpiaCompleted !== true) patch.metadata.dpiaCompleted = true;
    if (patch.metadata.piiHandling === "NOT-CONFIGURED") patch.metadata.piiHandling = "redacted-before-prompt";
    if (i.riskTier === "high") patch.metadata.humanApprovalRequired = true;
    if (i.riskTier === "prohibited") patch.status = "retired";
    try {
      const r = await api("PATCH", `/api/inventory/${i.id}`, patch);
      toast({ title: "Item updated", description: `Receipt ${r.receipt.id.slice(0, 12)}… signed` });
      onUpdate();
    } catch (e: any) {
      toast({ title: "Fix failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wrench className="size-5" /> Fix failing items</CardTitle>
        <CardDescription>Items below trip one or more Level 200 rules. Apply the suggested fix → a <code>design.modified</code> receipt is signed and added to your evidence chain.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {failing.length === 0 && (
          <Alert>
            <AlertDescription className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-green-600" /> No failing items — clean inventory.
            </AlertDescription>
          </Alert>
        )}
        {failing.map((i) => (
          <div key={i.id} className="rounded-md border p-3 flex items-start gap-3" data-testid={`fix-item-${i.id}`}>
            <Bug className="size-5 text-amber-600 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium flex items-center gap-2"><span>{i.name}</span> <RiskBadge tier={i.riskTier} /> <Badge variant="outline">{i.status}</Badge></div>
              <div className="text-xs text-muted-foreground mt-1">{i.useCase}</div>
              <div className="text-xs font-mono mt-1">metadata: {JSON.stringify(i.metadata)}</div>
            </div>
            <Button size="sm" onClick={() => autoFix(i)} data-testid={`button-fix-${i.id}`}>
              <Sparkles className="size-4 mr-1" /> Apply fix
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface PolicyRule {
  id: string;
  description: string;
  controlRef: string;
  field: string;
  op: string;
  value?: any;
}

const POLICY_EXAMPLES: PolicyRule[] = [
  { id: "PAC.1", description: "Block 'latest' version pinning", controlRef: "internal.versioning", field: "version", op: "notEquals", value: "latest" },
  { id: "PAC.2", description: "Require approved status", controlRef: "internal.lifecycle", field: "status", op: "in", value: ["approved", "retired", "draft"] },
  { id: "PAC.3", description: "Forbid prohibited risk in approved status", controlRef: "EU-AI-Act:Art.5", field: "riskTier", op: "notEquals", value: "prohibited" },
];

function PolicyAsCode({ onRun }: { onRun: () => void }) {
  const { toast } = useToast();
  const [json, setJson] = useState(JSON.stringify(POLICY_EXAMPLES, null, 2));
  const [result, setResult] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);

  async function evalRules() {
    let rules: PolicyRule[];
    try { rules = JSON.parse(json); }
    catch (e: any) { toast({ title: "Invalid JSON", description: e.message, variant: "destructive" }); return; }
    try {
      const r = await api("POST", "/api/lab/policy-eval", { rules });
      setResult(r.result);
      setReceipt(r.receipt);
      onRun();
    } catch (e: any) {
      toast({ title: "Eval failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ScrollText className="size-5" /> Policy-as-Code editor</CardTitle>
        <CardDescription>
          Author your own rules in JSON. Each rule selects a field on each inventory item and applies one of:
          <code className="ml-1">equals</code>, <code>notEquals</code>, <code>in</code>, <code>notIn</code>, <code>exists</code>, <code>truthy</code>.
          Use <code>metadata.X</code> to address nested fields.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          rows={12}
          value={json}
          onChange={(e) => setJson(e.target.value)}
          className="font-mono text-xs"
          data-testid="textarea-policy"
        />
        <Button onClick={evalRules} data-testid="button-policy-eval">Evaluate</Button>
        {result && <ChecklistView result={result} receipt={receipt} showItems />}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Evidence tab — my receipts + bundles + verify
// ---------------------------------------------------------------------------

function EvidenceTab() {
  const { toast } = useToast();
  const { data: receipts, reload: reloadReceipts } = useApiCall<{ receipts: any[] }>(() => api("GET", "/api/lab/receipts"), []);
  const { data: bundles, reload: reloadBundles } = useApiCall<{ bundles: any[] }>(() => api("GET", "/api/lab/bundles"), []);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, any>>({});

  async function verifyReceipt(id: string) {
    setVerifying(id);
    try {
      const r = await api("GET", `/api/lab/verify/receipt/${id}`);
      setVerifyResult((v) => ({ ...v, [id]: r }));
    } catch (e: any) {
      toast({ title: "Verify failed", description: e.message, variant: "destructive" });
    } finally { setVerifying(null); }
  }
  async function verifyBundle(id: string) {
    setVerifying(id);
    try {
      const r = await api("GET", `/api/lab/verify/bundle/${id}`);
      setVerifyResult((v) => ({ ...v, [id]: r }));
    } catch (e: any) {
      toast({ title: "Verify failed", description: e.message, variant: "destructive" });
    } finally { setVerifying(null); }
  }
  async function newBundle() {
    try { const r = await api("POST", "/api/lab/bundle", {}); toast({ title: "Bundle signed" }); reloadBundles(); }
    catch (e: any) { toast({ title: "Bundle failed", description: e.message, variant: "destructive" }); }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileSignature className="size-5" /> Receipts ({receipts?.receipts?.length ?? 0})</CardTitle>
          <CardDescription>Every action you took produced one of these.</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[28rem]">
            <div className="space-y-2">
              {receipts?.receipts?.map((r: any) => (
                <div key={r.id} className="rounded-md border p-3 text-sm" data-testid={`receipt-${r.id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <code className="text-xs">{r.id}</code>
                    <Badge>{r.eventType}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {r.subjectName ?? "—"} · {format(new Date(r.tsUtc), "Pp")}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => verifyReceipt(r.id)} disabled={verifying === r.id} data-testid={`button-verify-receipt-${r.id}`}>
                      Verify signature
                    </Button>
                    {verifyResult[r.id] && (
                      verifyResult[r.id].valid
                        ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> Valid</span>
                        : <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="size-3" /> {verifyResult[r.id].reason}</span>
                    )}
                  </div>
                </div>
              ))}
              {(!receipts || receipts.receipts.length === 0) && <p className="text-sm text-muted-foreground">No receipts yet. Take an action in Lab 100 or Lab 200.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Package className="size-5" /> Bundles ({bundles?.bundles?.length ?? 0})</CardTitle>
          <CardDescription>Merkle-rooted, Ed25519-signed evidence packs.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={newBundle} data-testid="button-new-bundle">Bundle current session receipts</Button>
          <ScrollArea className="h-[24rem]">
            <div className="space-y-2">
              {bundles?.bundles?.map((b: any) => (
                <div key={b.id} className="rounded-md border p-3 text-sm" data-testid={`bundle-${b.id}`}>
                  <div className="flex items-center justify-between flex-wrap gap-1">
                    <code className="text-xs">{b.id}</code>
                    <Badge variant="outline">{(b.receiptIds as string[]).length} receipts</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 font-mono break-all">
                    root: {b.merkleRoot.slice(0, 32)}…
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => verifyBundle(b.id)} disabled={verifying === b.id} data-testid={`button-verify-bundle-${b.id}`}>
                      Verify bundle
                    </Button>
                    {verifyResult[b.id] && (
                      verifyResult[b.id].valid
                        ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="size-3" /> Valid · {verifyResult[b.id].receiptCount} receipts OK</span>
                        : <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="size-3" /> {verifyResult[b.id].reason}</span>
                    )}
                  </div>
                </div>
              ))}
              {(!bundles || bundles.bundles.length === 0) && <p className="text-sm text-muted-foreground">No bundles yet.</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Step({ n, title, icon, body, action }: { n: number; title: string; icon: React.ReactNode; body: React.ReactNode; action: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="inline-flex items-center justify-center size-6 rounded-full bg-primary text-primary-foreground text-xs">{n}</span>
          {icon} {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {body}
        {action}
      </CardContent>
    </Card>
  );
}

function ReceiptCard({ receipt }: { receipt: any }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1 mt-3">
      <div className="flex items-center justify-between"><span className="font-medium">Signed receipt</span> <Badge variant="outline">{receipt.eventType}</Badge></div>
      <div className="font-mono break-all">id: {receipt.id}</div>
      <div className="font-mono break-all">sig: {receipt.signature.slice(0, 32)}…</div>
    </div>
  );
}

function ChecklistView({ result, receipt, showItems }: { result: any; receipt?: any; showItems?: boolean }) {
  const overall = result.overall;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {overall === "pass"
          ? <CheckCircle2 className="size-5 text-green-600" />
          : <XCircle className="size-5 text-red-600" />}
        <span className="font-semibold">Overall: {overall}</span>
        <span className="text-xs text-muted-foreground">
          ({result.rulesEvaluated.length} rules evaluated, {result.rulesFailed.length} failed)
        </span>
      </div>
      {result.rulesFailed.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.rulesFailed.map((r: string) => (
            <Badge key={r} variant="destructive">{r}</Badge>
          ))}
        </div>
      )}
      {showItems && (
        <ScrollArea className="h-48 rounded border bg-muted/30 p-2">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-muted-foreground">
              <th className="py-1">Item</th><th>Tier</th><th>Status</th><th>Failed rules</th>
            </tr></thead>
            <tbody>
              {result.items.map((i: any) => (
                <tr key={i.itemId} className="border-t">
                  <td className="py-1">{i.itemName}</td>
                  <td><RiskBadge tier={i.riskTier} /></td>
                  <td>{i.status}</td>
                  <td>
                    {i.failedRules.length === 0
                      ? <span className="text-green-600">pass</span>
                      : <span className="text-red-600 font-mono">{i.failedRules.join(", ")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      )}
      {receipt && <ReceiptCard receipt={receipt} />}
    </div>
  );
}

function BundleView({ bundle }: { bundle: any }) {
  return (
    <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
      <div className="font-semibold">Signed bundle</div>
      <div className="font-mono break-all">id: {bundle.id}</div>
      <div className="font-mono break-all">root: {bundle.merkleRoot.slice(0, 32)}…</div>
      <div>receipts: {bundle.receiptIds.length}</div>
      <div className="font-mono break-all">sig: {bundle.signature.slice(0, 32)}…</div>
    </div>
  );
}

function RiskBadge({ tier }: { tier: string }) {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    low: "secondary",
    medium: "outline",
    high: "default",
    prohibited: "destructive",
  };
  return <Badge variant={map[tier] ?? "outline"} className="capitalize">{tier}</Badge>;
}
