import { Moon, Sun, LogIn, LogOut, User, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { Link, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import logoImage from "@assets/i5GAK_1775293448252.jpg";

export default function Header() {
  const { user, logout } = useAuth();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const isMLB = location === "/mlb";
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "light" | "dark") || "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: "Logged out", description: "You've been successfully logged out." });
    } catch {
      toast({ variant: "destructive", title: "Error", description: "Failed to log out" });
    }
  };

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo + Brand */}
          <div className="flex items-center gap-3">
            <img
              src={logoImage}
              alt="First Basket Pro logo"
              className="w-14 h-14 rounded-md object-cover cursor-pointer"
              data-testid="img-logo"
              onClick={() => window.location.reload()}
            />
            <div className="flex items-center gap-2">
              <span className="text-base font-bold tracking-tight">
                {isMLB ? "NRFI Pro" : "First Basket Pro"}
              </span>
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4 font-mono hidden sm:flex">
                {isMLB ? "MLB" : "2025/26"}
              </Badge>
            </div>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon" variant="ghost" data-testid="button-user-menu">
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel className="text-xs">{user.email}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} data-testid="button-logout">
                    <LogOut className="mr-2 h-4 w-4" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="ghost" className="gap-1.5 text-xs" data-testid="button-login">
                    <LogIn className="h-3.5 w-3.5" />
                    Sign In
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                    Optional — data is free to browse
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setLocation("/login")} data-testid="menu-item-login">
                    <LogIn className="mr-2 h-4 w-4" />
                    Sign In
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setLocation("/signup")} data-testid="menu-item-signup">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Create Account
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "light" ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
