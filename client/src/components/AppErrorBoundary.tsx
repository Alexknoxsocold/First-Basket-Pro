import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[UI] Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4" role="main">
        <div className="w-full max-w-lg rounded-lg border bg-card p-6 text-center shadow-sm" role="alert">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
          <h1 className="mt-4 text-xl font-bold">Something didn’t load correctly</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account and saved data are unaffected. Reload the page to reconnect to the latest site data.
          </p>
          <Button className="mt-5 gap-2" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reload site
          </Button>
        </div>
      </main>
    );
  }
}
