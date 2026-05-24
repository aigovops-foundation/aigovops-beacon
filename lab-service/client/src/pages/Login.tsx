import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { setToken, api, apiUrl } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ShieldCheck, KeyRound, Lock } from "lucide-react";

interface StatusResp {
  labName: string;
  paused: boolean;
  pauseMessage: string;
  tenants: Array<{ id: string; name: string; description: string; keyFingerprint: string }>;
}

export default function Login() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<StatusResp | null>(null);
  const [tab, setTab] = useState("trainee");
  const [traineeToken, setTraineeToken] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/api/status")).then((r) => r.json()).then(setStatus).catch(() => {});
    // Auto-detect ?t= token in URL hash query (e.g. #/login?t=abc)
    const m = window.location.hash.match(/[?&]t=([a-f0-9]+)/i);
    if (m) setTraineeToken(m[1]);
  }, []);

  async function loginTrainee(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await api("POST", "/api/login", { token: traineeToken.trim() });
      setToken(data.token);
      navigate("/lab");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function loginAdmin(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const data = await api("POST", "/api/admin/login", { password: adminPw });
      setToken(data.token);
      navigate("/admin");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[hsl(184,35%,96%)] to-background p-6">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="size-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <ShieldCheck className="size-6" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-bold tracking-tight">{status?.labName ?? "AIGovOps Beacon Lab"}</h1>
              <p className="text-xs text-muted-foreground font-mono">
                Live training environment
              </p>
            </div>
          </div>
        </div>

        {status?.paused && (
          <Alert>
            <AlertDescription>
              <strong>Lab paused:</strong> {status.pauseMessage}
            </AlertDescription>
          </Alert>
        )}

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Trainees use a magic-link token from the instructor. Admins sign in with the lab password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid grid-cols-2 w-full mb-4">
                <TabsTrigger value="trainee" data-testid="tab-trainee">
                  <KeyRound className="size-4 mr-2" /> Trainee
                </TabsTrigger>
                <TabsTrigger value="admin" data-testid="tab-admin">
                  <Lock className="size-4 mr-2" /> Admin
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trainee">
                <form onSubmit={loginTrainee} className="space-y-4">
                  <div>
                    <Label htmlFor="token">Magic-link token</Label>
                    <Input
                      id="token"
                      data-testid="input-trainee-token"
                      value={traineeToken}
                      onChange={(e) => setTraineeToken(e.target.value)}
                      placeholder="Paste the token your instructor sent"
                      autoComplete="off"
                      required
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      Tokens are single-use and time-limited. If you don't have one, ask the instructor to issue you a fresh link.
                    </p>
                  </div>
                  {err && tab === "trainee" && (
                    <Alert variant="destructive">
                      <AlertDescription>{err}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={loading} data-testid="button-trainee-login">
                    {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                    Enter the lab
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="admin">
                <form onSubmit={loginAdmin} className="space-y-4">
                  <div>
                    <Label htmlFor="pw">Admin password</Label>
                    <Input
                      id="pw"
                      type="password"
                      data-testid="input-admin-password"
                      value={adminPw}
                      onChange={(e) => setAdminPw(e.target.value)}
                      required
                    />
                  </div>
                  {err && tab === "admin" && (
                    <Alert variant="destructive">
                      <AlertDescription>{err}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" className="w-full" disabled={loading} data-testid="button-admin-login">
                    {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                    Sign in as admin
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {status?.tenants && (
          <div className="text-center text-xs text-muted-foreground">
            <p>Demo tenants available: {status.tenants.map((t) => t.name).join(" · ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
