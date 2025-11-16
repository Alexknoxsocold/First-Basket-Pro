import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Key } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export default function Invite() {
  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // If already logged in, redirect to home
  if (user) {
    setLocation("/");
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await apiRequest("POST", "/api/auth/invite", { code });
      const data = await res.json();
      
      // Refresh page to update auth context
      window.location.href = "/";
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Invalid invite code",
        description: error instanceof Error ? error.message : "Please check your invite code and try again"
      });
      setIsLoading(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-16rem)]">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <CardTitle>Enter Invite Code</CardTitle>
          </div>
          <CardDescription>
            Enter the special invite code to access First Basket PRO
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="code">Invite Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="Enter your invite code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                required
                disabled={isLoading}
                data-testid="input-invite-code"
                className="font-mono"
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-submit-invite"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Access with Invite Code
                </>
              )}
            </Button>
            <div className="text-sm text-muted-foreground text-center">
              Don't have an invite code?{" "}
              <a href="/signup" className="text-primary hover:underline" data-testid="link-signup">
                Sign up here
              </a>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
