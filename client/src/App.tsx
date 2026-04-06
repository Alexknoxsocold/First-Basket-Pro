import { Switch, Route, Link } from "wouter";
import { useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import SplashScreen from "@/components/SplashScreen";
import AllGames from "@/pages/AllGames";
import OpeningTips from "@/pages/OpeningTips";
import PlayerStats from "@/pages/PlayerStats";
import TeamStats from "@/pages/TeamStats";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Invite from "@/pages/Invite";
import NRFIPro from "@/pages/NRFIPro";
import Legal from "@/pages/Legal";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/signup" component={Signup} />
      <Route path="/login" component={Login} />
      <Route path="/invite" component={Invite} />
      <Route path="/" component={AllGames} />
      <Route path="/opening-tips" component={OpeningTips} />
      <Route path="/player-stats" component={PlayerStats} />
      <Route path="/team-stats" component={TeamStats} />
      <Route path="/mlb" component={NRFIPro} />
      <Route path="/legal" component={Legal} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [splashDone, setSplashDone] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          {!splashDone && <SplashScreen onDone={() => setSplashDone(true)} />}
          <div className="min-h-screen bg-background flex flex-col">
            <Header />
            <Navigation />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 lg:px-8 py-8">
              <Router />
            </main>
            <footer className="border-t bg-card mt-8">
              <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground">
                  © {new Date().getFullYear()} PreziBaskets. For entertainment purposes only.
                </span>
                <div className="flex items-center gap-4">
                  <Link href="/legal?tab=terms" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Terms of Service
                  </Link>
                  <Link href="/legal?tab=privacy" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    Privacy Policy
                  </Link>
                </div>
              </div>
            </footer>
          </div>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
