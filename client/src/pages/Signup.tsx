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

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { signup } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const wantsPro = new URLSearchParams(window.location.search).get("next") === "pro";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({ variant: "destructive", title: "Passwords don't match", description: "Please make sure your passwords match" });
      return;
    }

    if (password.length < 8) {
      toast({ variant: "destructive", title: "Password too short", description: "Password must be at least 8 characters" });
      return;
    }

    setIsLoading(true);

    try {
      await signup(email, password);
      toast({
        title: wantsPro ? "Account created — one more step" : "Account created!",
        description: wantsPro ? "Complete your $11 Pro checkout using this same email address." : "You've successfully signed up and are now logged in."
      });
      if (wantsPro) {
        window.location.assign(WHOP_PRO_URL);
      } else {
        setLocation("/");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Signup failed",
        description: error instanceof Error ? error.message : "Failed to create account"
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          {wantsPro && <div className="mb-2 flex items-center gap-2 text-primary"><Crown className="h-4 w-4" /><span className="text-xs font-black uppercase tracking-wider">PreziTools Pro · $11/month</span></div>}
          <CardTitle>{wantsPro ? "Create your PreziTools account" : "Create an Account"}</CardTitle>
          <CardDescription>
            {wantsPro
              ? "Create your account first, then you'll continue to secure Whop checkout. Use this same email during checkout so your Pro membership unlocks automatically every time you sign in."
              : "Completely optional — all free features can be browsed without signing up. An account lets PreziTools remember your access and preferences."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required disabled={isLoading} autoComplete="email" data-testid="input-email" />
              {wantsPro && <p className="text-xs text-primary/90">Use this exact email again at Whop checkout.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required disabled={isLoading} autoComplete="new-password" data-testid="input-password" />
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input id="confirm-password" type="password" placeholder="••••••••" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required disabled={isLoading} autoComplete="new-password" data-testid="input-confirm-password" />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isLoading} data-testid="button-signup-submit">
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account...</> : wantsPro ? "Create Account & Continue to Pro" : "Create Account"}
            </Button>
            <p className="text-sm text-muted-foreground text-center">
              Already have an account?{" "}
              <Link href={wantsPro ? "/login?next=pro" : "/login"} className="text-primary hover:underline font-medium" data-testid="link-login">Sign in</Link>
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
