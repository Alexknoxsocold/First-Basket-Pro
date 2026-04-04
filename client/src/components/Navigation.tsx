import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutGrid, BarChart2, Layers, Settings } from "lucide-react";

const navItems = [
  { label: "All Games", path: "/", icon: LayoutGrid },
  { label: "Player FB Stats", path: "/player-stats", icon: BarChart2 },
  { label: "Parlays", path: "/parlays", icon: Layers },
];

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="border-b bg-card sticky top-14 z-40">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-0 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <span
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "")} />
                  {item.label}
                </span>
              </Link>
            );
          })}

          <div className="ml-auto flex items-center">
            <Link href="/admin">
              <span className="flex items-center gap-1.5 px-3 py-3 text-xs text-muted-foreground hover:text-foreground cursor-pointer whitespace-nowrap">
                <Settings className="w-3.5 h-3.5" />
                Admin
              </span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
