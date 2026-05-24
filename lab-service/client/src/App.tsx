import { Switch, Route, Router } from "wouter";
import { useHashLocation as useHashLocationRaw } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";

// Wrap useHashLocation to strip query strings, so /login?t=xyz still matches /login.
const useHashLocation = ((options?: { ssrPath?: string }) => {
  const [loc, setLoc] = useHashLocationRaw(options);
  return [loc.split("?")[0], setLoc] as [string, typeof setLoc];
}) as typeof useHashLocationRaw;
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Admin from "@/pages/Admin";
import Lab from "@/pages/Lab";

function AppRouter() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/admin" component={Admin} />
      <Route path="/lab" component={Lab} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router hook={useHashLocation}>
          <AppRouter />
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
