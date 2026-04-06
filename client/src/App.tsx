import { Switch, Route } from "wouter";
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
          <div className="min-h-screen bg-background">
            <Header />
            <Navigation />
            <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
              <Router />
            </main>
          </div>
          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
