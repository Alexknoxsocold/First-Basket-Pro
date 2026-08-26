import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Crown } from "lucide-react";

const WHOP_PRO_URL = "https://whop.com/prezitools/prezitools-pro/";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const wantsPro = new URLSearchParams(window.location.search).get("next") === "pro";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);
      toast({
        title: wantsPro ? "Signed in — continue to Pro" : "Welcome back!",
        description: wantsPro ? "Complete checkout using this same email address so Pro unlocks automatically." : "You've successfully logged in."
      });
      if (wantsPro) {
        window.location.assign(WHOP_PRO_URL);
      } else {
        setLocation("/");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Login failed",
        description: error instanceof Error ? error.message : "Invalid email or password"
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          {wantsPro && <div className="mb-2 flex items-center gap-2 text-primary"><Crown className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-wider">Continue to PreziTools Pro</span></div>}
          <CardTitle>{wantsPro ? "Sign in before checkout" : "Sign In"}</CardTitle>
          <CardDescription>
            {wantsPro
              ? "Sign in to your PreziTools account first. Afterward you'll continue to Whop checkout. Use the same email on Whop so this account receives Pro access automatically."
              : "All free features can be browsed without an account. Sign in to restore your account access and preferences."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} autoComplete="email" data-testid="input-email" />
              {wantsPro && <p className="text-xs text-primary/90">Use this exact email at Whop checkout.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoading} autoComplete="current-password" data-testid="input-password" />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-login-submit">
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : wantsPro ? "Sign In & Continue to Pro" : "Sign In"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Don't have an account?{" "}
              <Link href={wantsPro ? "/signup?next=pro" : "/signup"} className="text-primary hover:underline font-medium" data-testid="link-signup">Sign up free</Link>
            </p>
            <Link href="/" className="w-full" data-testid="link-browse-without-account">
              <Button type="button" variant="ghost" className="w-full gap-1.5 text-muted-foreground"><ArrowLeft className="h-3.5 w-3.5" />Continue with Free</Button>
            </Link>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
