import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import AllGames from "@/pages/AllGames";
import OpeningTips from "@/pages/OpeningTips";
import PlayerStats from "@/pages/PlayerStats";
import TeamStats from "@/pages/TeamStats";
import Parlays from "@/pages/Parlays";
import Admin from "@/pages/Admin";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={AllGames} />
      <Route path="/opening-tips" component={OpeningTips} />
      <Route path="/player-stats" component={PlayerStats} />
      <Route path="/team-stats" component={TeamStats} />
      <Route path="/parlays" component={Parlays} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <Header />
          <Navigation />
          <main className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8">
            <Router />
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
