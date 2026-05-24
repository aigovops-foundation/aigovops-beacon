import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { api, getToken, setToken, useApiCall, apiUrl, hydrateSession, hasSession } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Pause, Play, RotateCcw, KeyRound, Send, Copy, ShieldCheck, LogOut, Trash2, Power,
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface Tenant {
  id: string;
  name: string;
  description: string;
  ein?: string;
  keyFingerprint: string;
  publicKey: string;
}

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [paused, setPaused] = useState(false);
  const [pauseMsg, setPauseMsg] = useState("");
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [labName, setLabName] = useState("");

  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    // After a page refresh the in-memory token is null but the HttpOnly
    // session cookie may still be valid. Probe /api/me to learn the truth
    // before deciding to redirect.
    (async () => {
      if (getToken() || hasSession()) {
        setAuthChecked(true);
        refresh();
        return;
      }
      const ok = await hydrateSession();
      if (!ok) {
        navigate("/");
        return;
      }
      setAuthChecked(true);
      refresh();
    })();
  }, []);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading admin console…</div>
      </div>
    );
  }

  async function refresh() {
    try {
      const s = await fetch(apiUrl("/api/status")).then((r) => r.json());
      setPaused(s.paused);
      setPauseMsg(s.pauseMessage);
      setTenants(s.tenants);
      setLabName(s.labName);
    } catch (e: any) {
      toast({ title: "Status load failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <h1 className="font-semibold leading-tight">{labName}</h1>
              <p className="text-xs text-muted-foreground">Admin console</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={paused ? "destructive" : "default"} data-testid="badge-status">
              {paused ? "Paused" : "Running"}
            </Badge>
            <Button variant="outline" size="sm" onClick={async () => {
              try { await api("POST", "/api/logout"); } catch {}
              setToken(null);
              navigate("/");
            }} data-testid="button-logout">
              <LogOut className="size-4 mr-2" /> Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <Tabs defaultValue="control" className="space-y-6">
          <TabsList>
            <TabsTrigger value="control" data-testid="tab-control">Lab control</TabsTrigger>
            <TabsTrigger value="links" data-testid="tab-links">Magic links</TabsTrigger>
            <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="control">
            <ControlPanel paused={paused} pauseMessage={pauseMsg} onChange={refresh} tenants={tenants} />
          </TabsContent>
          <TabsContent value="links">
            <LinkIssuer tenants={tenants} />
          </TabsContent>
          <TabsContent value="evidence">
            <EvidenceBrowser tenants={tenants} />
          </TabsContent>
          <TabsContent value="security">
            <SecurityPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Control Panel — pause/resume/reset
// ---------------------------------------------------------------------------

function ControlPanel({
  paused, pauseMessage, onChange, tenants,
}: { paused: boolean; pauseMessage: string; onChange: () => void; tenants: Tenant[] }) {
  const { toast } = useToast();
  const [msg, setMsg] = useState(pauseMessage);
  useEffect(() => { setMsg(pauseMessage); }, [pauseMessage]);

  async function pause() {
    try {
      await api("POST", "/api/admin/pause", { message: msg });
      toast({ title: "Lab paused", description: "Trainees see 503 until you resume." });
      onChange();
    } catch (e: any) {
      toast({ title: "Pause failed", description: e.message, variant: "destructive" });
    }
  }
  async function resume() {
    try {
      await api("POST", "/api/admin/resume");
      toast({ title: "Lab resumed" });
      onChange();
    } catch (e: any) {
      toast({ title: "Resume failed", description: e.message, variant: "destructive" });
    }
  }
  async function reset() {
    if (!window.confirm("Reset all trainee data (receipts, runs, bundles, sessions, links)?\nTenant signing keys and admin password are kept.")) return;
    try {
      await api("POST", "/api/admin/reset");
      toast({ title: "Lab reset", description: "All trainee data cleared. Inventory re-seeded." });
      onChange();
    } catch (e: any) {
      toast({ title: "Reset failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Power className="size-5" /> Pause / resume
          </CardTitle>
          <CardDescription>
            Pause blocks all trainee API calls with a 503 + banner. Resume reverses it instantly.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="msg">Pause message (shown to trainees)</Label>
            <Input
              id="msg"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              data-testid="input-pause-message"
            />
          </div>
          <div className="flex gap-2">
            {paused ? (
              <Button onClick={resume} className="flex-1" data-testid="button-resume">
                <Play className="size-4 mr-2" /> Resume lab
              </Button>
            ) : (
              <Button onClick={pause} variant="default" className="flex-1" data-testid="button-pause">
                <Pause className="size-4 mr-2" /> Pause lab
              </Button>
            )}
          </div>
          {paused && (
            <Alert>
              <AlertDescription>Lab is currently <strong>paused</strong>.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RotateCcw className="size-5" /> Reset lab data
          </CardTitle>
          <CardDescription>
            Clears trainee receipts, runs, bundles, sessions, and links. Inventory is re-seeded fresh.
            Tenant signing keys and your admin password remain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={reset} data-testid="button-reset">
            <Trash2 className="size-4 mr-2" /> Reset trainee data
          </Button>
        </CardContent>
      </Card>

      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Demo tenants</CardTitle>
          <CardDescription>Each tenant has its own Ed25519 signing key.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            {tenants.map((t) => (
              <div key={t.id} className="rounded-lg border p-4 bg-card" data-testid={`card-tenant-${t.id}`}>
                <div className="font-semibold">{t.name}</div>
                <div className="text-xs text-muted-foreground font-mono mt-1">EIN {t.ein ?? "—"}</div>
                <div className="text-sm mt-2">{t.description}</div>
                <div className="text-xs font-mono mt-3 truncate" title={t.keyFingerprint}>
                  fpr: {t.keyFingerprint}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Magic-link issuer
// ---------------------------------------------------------------------------

function LinkIssuer({ tenants }: { tenants: Tenant[] }) {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [ttl, setTtl] = useState(60);
  const [issued, setIssued] = useState<{ token: string; tenantId: string; label: string } | null>(null);
  const { data, reload } = useApiCall<{ links: any[] }>(() => api("GET", "/api/admin/links"), []);

  useEffect(() => { if (!tenantId && tenants[0]) setTenantId(tenants[0].id); }, [tenants]);

  async function issue() {
    if (!tenantId || !label) {
      toast({ title: "Need tenant + label", variant: "destructive" });
      return;
    }
    try {
      const r = await api("POST", "/api/admin/issue-link", {
        tenantId, label, email: email || undefined, ttlMinutes: ttl,
      });
      setIssued({ token: r.token, tenantId, label });
      reload();
    } catch (e: any) {
      toast({ title: "Issue failed", description: e.message, variant: "destructive" });
    }
  }

  async function revoke(token: string) {
    if (!window.confirm("Revoke this link?")) return;
    try {
      await api("POST", "/api/admin/revoke-link", { token });
      reload();
    } catch (e: any) {
      toast({ title: "Revoke failed", description: e.message, variant: "destructive" });
    }
  }

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  const fullLink = issued ? `${baseUrl}#/login?t=${issued.token}` : "";
  const tenantName = issued ? tenants.find((t) => t.id === issued.tenantId)?.name ?? issued.tenantId : "";

  function copy(text: string) {
    navigator.clipboard?.writeText(text);
    toast({ title: "Copied" });
  }

  const mailtoBody = issued
    ? encodeURIComponent(
        `You're invited to the AIGovOps Beacon training lab.\n\n` +
        `Tenant: ${tenantName}\n\n` +
        `Sign-in link (single-use, expires in ${ttl} min):\n${fullLink}\n\n` +
        `Or visit ${baseUrl} and paste this token: ${issued.token}\n`
      )
    : "";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Issue a new link</CardTitle>
          <CardDescription>Generate a single-use sign-in for a trainee.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger data-testid="select-tenant"><SelectValue placeholder="Choose tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="label">Trainee label</Label>
            <Input id="label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Trainee #3, Bob R." data-testid="input-label" />
          </div>
          <div>
            <Label htmlFor="email">Email (optional, for your records)</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="trainee@example.org" data-testid="input-email" />
          </div>
          <div>
            <Label htmlFor="ttl">Time-to-live (minutes)</Label>
            <Input id="ttl" type="number" min={5} max={10080} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} data-testid="input-ttl" />
          </div>
          <Button onClick={issue} className="w-full" data-testid="button-issue">
            <KeyRound className="size-4 mr-2" /> Issue link
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{issued ? "Send this to the trainee" : "Latest links"}</CardTitle>
          <CardDescription>
            {issued ? "Open in your own email client — the lab does not send email." : "Click revoke to invalidate."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {issued && (
            <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
              <div className="text-xs font-mono break-all" data-testid="text-magic-link">{fullLink}</div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => copy(fullLink)} data-testid="button-copy-link">
                  <Copy className="size-4 mr-2" /> Copy link
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(issued.token)} data-testid="button-copy-token">
                  <Copy className="size-4 mr-2" /> Copy token
                </Button>
                <a
                  href={`mailto:${email || ""}?subject=${encodeURIComponent("AIGovOps Beacon Lab — sign-in link")}&body=${mailtoBody}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" data-testid="button-mailto">
                    <Send className="size-4 mr-2" /> Open email client
                  </Button>
                </a>
              </div>
            </div>
          )}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data?.links?.length === 0 && <p className="text-sm text-muted-foreground">No links issued yet.</p>}
            {data?.links?.map((l: any) => {
              const status = l.revokedAt
                ? "revoked"
                : l.consumedAt
                ? "used"
                : new Date(l.expiresAt).getTime() < Date.now()
                ? "expired"
                : "active";
              return (
                <div key={l.token} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm" data-testid={`link-${l.token}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.label}</div>
                    <div className="text-xs text-muted-foreground font-mono truncate">{l.token.slice(0, 16)}…</div>
                    <div className="text-xs text-muted-foreground">
                      {l.tenantId} · expires {format(new Date(l.expiresAt), "PPp")}
                    </div>
                  </div>
                  <Badge variant={status === "active" ? "default" : "secondary"}>{status}</Badge>
                  {status === "active" && (
                    <Button size="sm" variant="outline" onClick={() => revoke(l.token)} data-testid={`button-revoke-${l.token.slice(0,8)}`}>Revoke</Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Evidence browser
// ---------------------------------------------------------------------------

function EvidenceBrowser({ tenants }: { tenants: Tenant[] }) {
  const [tenantId, setTenantId] = useState<string>("");
  useEffect(() => { if (!tenantId && tenants[0]) setTenantId(tenants[0].id); }, [tenants]);

  const { data: receiptData, reload } = useApiCall<{ receipts: any[] }>(
    () => tenantId ? api("GET", `/api/admin/receipts/${tenantId}`) : Promise.resolve({ receipts: [] }),
    [tenantId]
  );
  const { data: sessionData } = useApiCall<{ sessions: any[] }>(
    () => api("GET", "/api/admin/sessions"),
    []
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Receipts</CardTitle>
          <CardDescription>All signed evidence envelopes for this tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-w-xs">
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger>
              <SelectContent>
                {tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {receiptData?.receipts?.length === 0 && <p className="text-sm text-muted-foreground">No receipts yet.</p>}
            {receiptData?.receipts?.map((r: any) => (
              <div key={r.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <code className="text-xs">{r.id}</code>
                  <Badge>{r.eventType}</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.subjectName ?? "—"} · {format(new Date(r.tsUtc), "PPp")} · key {r.keyFingerprint.slice(0, 24)}…
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {sessionData?.sessions?.length === 0 && <p className="text-sm text-muted-foreground">No active sessions.</p>}
          {sessionData?.sessions?.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <div className="font-medium">{s.label} {s.isAdmin && <Badge className="ml-2" variant="default">admin</Badge>}</div>
                <div className="text-xs text-muted-foreground font-mono">{s.tenantId} · {s.id.slice(0, 16)}…</div>
              </div>
              <div className="text-xs text-muted-foreground">
                expires {format(new Date(s.expiresAt), "p")}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Security panel — password rotation
// ---------------------------------------------------------------------------

function SecurityPanel() {
  const { toast } = useToast();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  async function rotate() {
    if (pw !== pw2) { toast({ title: "Passwords don't match", variant: "destructive" }); return; }
    if (pw.length < 8) { toast({ title: "Min 8 characters", variant: "destructive" }); return; }
    try {
      await api("POST", "/api/admin/rotate-password", { newPassword: pw });
      toast({ title: "Password rotated", description: "Use the new password for next sign-in." });
      setPw(""); setPw2("");
    } catch (e: any) {
      toast({ title: "Rotate failed", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Rotate admin password</CardTitle>
        <CardDescription>Sessions stay valid until they expire — the new password applies on next sign-in.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="np">New password</Label>
          <Input id="np" type="password" value={pw} onChange={(e) => setPw(e.target.value)} data-testid="input-new-password" />
        </div>
        <div>
          <Label htmlFor="np2">Confirm</Label>
          <Input id="np2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} data-testid="input-confirm-password" />
        </div>
        <Button onClick={rotate} data-testid="button-rotate-password">Rotate</Button>
      </CardContent>
    </Card>
  );
}
