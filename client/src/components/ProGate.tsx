import { Crown, LockKeyhole } from "lucide-react";
import { useBilling } from "@/context/BillingContext";

const WHOP_PRO_URL = "https://whop.com/prezitools/prezitools-pro/";

type ProGateProps = {
  children: React.ReactNode;
  title?: string;
  description?: string;
  preview?: React.ReactNode;
};

export default function ProGate({ children, title = "PreziTools Pro", description = "Upgrade to unlock this Pro feature.", preview }: ProGateProps) {
  const { pro, isLoading } = useBilling();

  if (isLoading) return <>{preview ?? children}</>;
  if (pro) return <>{children}</>;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-card/80 p-5 shadow-sm">
      {preview ? <div className="pointer-events-none select-none opacity-35 blur-[2px]">{preview}</div> : null}
      <div className={preview ? "absolute inset-0 flex items-center justify-center p-4" : "flex items-center justify-center"}>
        <div className="w-full max-w-sm rounded-2xl border border-primary/30 bg-background/90 p-5 text-center shadow-xl backdrop-blur-xl">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole className="h-4 w-4" /></div>
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm font-black"><Crown className="h-3.5 w-3.5 text-primary" />{title}</div>
          <p className="mx-auto mt-1.5 max-w-xs text-[10px] leading-4 text-muted-foreground">{description}</p>
          <button type="button" onClick={() => window.open(WHOP_PRO_URL, "_blank", "noopener,noreferrer")} className="mt-4 h-9 w-full rounded-lg bg-primary text-[10px] font-black text-primary-foreground transition hover:brightness-105">Upgrade to Pro — $11/mo</button>
        </div>
      </div>
    </div>
  );
}
