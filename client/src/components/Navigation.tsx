import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "All Games", path: "/" },
  { label: "Opening Tips", path: "/opening-tips" },
  { label: "Player FB Stats", path: "/player-stats" },
  { label: "Parlays", path: "/parlays" },
];

export default function Navigation() {
  const [location] = useLocation();

  return (
    <nav className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-1 overflow-x-auto">
          {navItems.map((item) => (
            <Link key={item.path} href={item.path}>
              <span
                className={cn(
                  "px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap hover-elevate cursor-pointer inline-block",
                  location === item.path
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground"
                )}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
