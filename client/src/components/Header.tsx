import { Moon, Sun, LogIn, LogOut, User, UserPlus, Crown, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useBilling } from "@/context/BillingContext";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import logoImage from "@assets/i5GAK_1775293448252.jpg";

const WHOP_PRO_URL = "https://whop.com/prezitools/prezitools-pro/";

function seasonLabel(sport: "NBA" | "WNBA" | "MLB" | "NFL", date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  if (sport === "NBA") { const start = month >= 7 ? year : year - 1; return `${String(start).slice(-2)}/${String(start + 1).slice(-2)}`; }
  if (sport === "WNBA" || sport === "MLB") return String(year);
  const nflYear = month >= 3 ? year : year - 1;
  return String(nflYear);
}

export default function Header() {
  const { user, logout } = useAuth();
  const { pro, isLoading: billingLoading, manageUrl } = useBilling();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isMLB = location === "/mlb" || location.startsWith("/mlb/");
  const isNFL = location === "/nfl" || location.startsWith("/nfl/");
  const isWNBA = location === "/wnba" || location.startsWith("/wnba/");
  const isNBA = location === "/nba" || location.startsWith("/nba/");
  const isBestPlays = location === "/";
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("theme") as "light" | "dark") || "dark");

  useEffect(() => { const root = window.document.documentElement; root.classList.remove("light", "dark"); root.classList.add(theme); localStorage.setItem("theme", theme); }, [theme]);
  const toggleTheme = () => setTheme(theme === "light" ? "dark" : "light");
  const handleLogout = async () => { try { await logout(); toast({ title: "Logged out", description: "You've been successfully logged out." }); } catch { toast({ variant: "destructive", title: "Error", description: "Failed to log out" }); } };
  const startProCheckout = () => { if (!user) { setLocation("/signup?next=pro"); return; } window.open(WHOP_PRO_URL, "_blank", "noopener,noreferrer"); };
  const brand = isBestPlays ? "Prezi Tools" : isMLB ? "MLB Pro" : isNFL ? "NFL Pro" : "First Basket Pro";
  const badge = isMLB ? seasonLabel("MLB") : isNFL ? seasonLabel("NFL") : isWNBA ? seasonLabel("WNBA") : isNBA ? seasonLabel("NBA") : null;

  return <header className="site-header sticky top-0 z-50 border-b bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/85">
    <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
      <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
        <button type="button" onClick={() => setLocation("/")} className="flex items-center gap-2.5 min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Go to Prezi Tools home">
          <img src={logoImage} alt="Prezi Tools logo" className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg object-cover shadow-sm ring-1 ring-border/70" data-testid="img-logo" />
          <div className="flex items-center gap-2 min-w-0 text-left"><span className="text-sm sm:text-base font-bold tracking-tight truncate">{brand}</span>{!isBestPlays && badge && <Badge variant="secondary" className="text-[9px] sm:text-xs px-1.5 py-0 h-4 font-mono hidden xs:flex">{badge}</Badge>}{user && !billingLoading && pro && <Badge className="hidden sm:inline-flex h-5 gap-1 border border-primary/30 bg-primary/10 px-2 text-[9px] font-black text-primary hover:bg-primary/10"><Crown className="h-3 w-3" />PRO</Badge>}</div>
        </button>
        <div className="flex items-center gap-1 sm:gap-2">
          {!billingLoading && !pro && <Button size="sm" className="hidden sm:flex h-8 gap-1.5 px-3 text-[10px] font-black" onClick={startProCheckout}><Crown className="h-3.5 w-3.5" />Upgrade Pro</Button>}
          {user ? <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg" data-testid="button-user-menu"><User className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-56"><DropdownMenuLabel className="text-xs"><div className="truncate">{user.email}</div>{!billingLoading && <div className={`mt-1 text-[9px] font-black uppercase tracking-wider ${pro ? "text-primary" : "text-muted-foreground"}`}>{pro ? "PreziTools Pro" : "Free plan"}</div>}</DropdownMenuLabel><DropdownMenuSeparator />{!billingLoading && (pro ? (manageUrl ? <DropdownMenuItem onClick={() => window.open(manageUrl, "_blank", "noopener,noreferrer")}><ExternalLink className="mr-2 h-4 w-4" />Manage Pro</DropdownMenuItem> : null) : <DropdownMenuItem onClick={startProCheckout}><Crown className="mr-2 h-4 w-4 text-primary" />Upgrade to Pro</DropdownMenuItem>)}<DropdownMenuItem onClick={handleLogout} data-testid="button-logout"><LogOut className="mr-2 h-4 w-4" />Logout</DropdownMenuItem></DropdownMenuContent></DropdownMenu> : <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-9 gap-1.5 rounded-lg px-2.5 text-xs" data-testid="button-login"><LogIn className="h-3.5 w-3.5" /><span className="hidden xs:inline">Sign In</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-44"><DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Optional — data is free to browse</DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onClick={() => setLocation("/login")}><LogIn className="mr-2 h-4 w-4" />Sign In</DropdownMenuItem><DropdownMenuItem onClick={() => setLocation("/signup")}><UserPlus className="mr-2 h-4 w-4" />Create Account</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onClick={startProCheckout}><Crown className="mr-2 h-4 w-4 text-primary" />Get Pro — $11/mo</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}
          <Button size="icon" variant="ghost" className="h-9 w-9 rounded-lg" onClick={toggleTheme} data-testid="button-theme-toggle" aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}</Button>
        </div>
      </div>
    </div>
  </header>;
}
