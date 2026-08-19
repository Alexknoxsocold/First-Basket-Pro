import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { LayoutGrid, CircleDot, Trophy } from "lucide-react";

const navItems = [
  { label: "NBA", path: "/", icon: LayoutGrid },
  { label: "WNBA", path: "/wnba", icon: Trophy },
  { label: "MLB", path: "/mlb", icon: CircleDot },
];

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="border-b bg-card sticky top-14 z-40" aria-label="Primary sports navigation">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-0 overflow-x-auto overscroll-x-contain">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <span
                  className={cn(
                    "min-h-11 flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    isActive
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30"
                  )}
                  aria-current={isActive ? "page" : undefined}
                  data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon aria-hidden="true" className={cn("w-3.5 h-3.5", isActive ? "text-primary" : "")} />
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
