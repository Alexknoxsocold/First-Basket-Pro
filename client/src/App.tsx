import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Header from "@/components/Header";
import Navigation from "@/components/Navigation";
import AllGames from "@/pages/AllGames";
import OpeningTips from "@/pages/OpeningTips";
import PlayerStats from "@/pages/PlayerStats";
import TeamStats from "@/pages/TeamStats";
import Parlays from "@/pages/Parlays";
import Admin from "@/pages/Admin";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/signup" component={Signup} />
      <Route path="/login" component={Login} />
      <Route path="/">
        <ProtectedRoute>
          <AllGames />
        </ProtectedRoute>
      </Route>
      <Route path="/opening-tips">
        <ProtectedRoute>
          <OpeningTips />
        </ProtectedRoute>
      </Route>
      <Route path="/player-stats">
        <ProtectedRoute>
          <PlayerStats />
        </ProtectedRoute>
      </Route>
      <Route path="/team-stats">
        <ProtectedRoute>
          <TeamStats />
        </ProtectedRoute>
      </Route>
      <Route path="/parlays">
        <ProtectedRoute>
          <Parlays />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <Admin />
        </ProtectedRoute>
      </Route>
      <Route>
        <ProtectedRoute>
          <NotFound />
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
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
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
