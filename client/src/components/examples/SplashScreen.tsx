import { useEffect, useState } from "react";

interface SplashScreenProps {
  onDone: () => void;
}

export default function SplashScreen({ onDone }: SplashScreenProps) {
  const [phase, setPhase] = useState<"in" | "hold" | "fading">("in");

  useEffect(() => {
    const holdTimer  = setTimeout(() => setPhase("hold"),   400);
    const fadeTimer  = setTimeout(() => setPhase("fading"), 2400);
    const doneTimer  = setTimeout(() => onDone(),           3100);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  const visible = phase !== "fading";

  return (
    <>
      <style>{`
        @keyframes orb-drift-1 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(40px,-30px) scale(1.15); }
        }
        @keyframes orb-drift-2 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(-35px,25px) scale(1.2); }
        }
        @keyframes orb-drift-3 {
          0%,100% { transform: translate(0,0) scale(1); }
          50%      { transform: translate(20px,40px) scale(0.9); }
        }
        @keyframes ring-pulse {
          0%,100% { opacity:0.55; transform:scale(1); }
          50%      { opacity:0.9;  transform:scale(1.04); }
        }
        @keyframes ring-pulse-2 {
          0%,100% { opacity:0.25; transform:scale(1); }
          50%      { opacity:0.5;  transform:scale(1.08); }
        }
        @keyframes shimmer {
          0%   { background-position: -400px 0; }
          100% { background-position:  400px 0; }
        }
      `}</style>

      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9999,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at 50% 60%, #0a1a0e 0%, #050d06 55%, #000000 100%)",
          opacity: visible ? 1 : 0,
          transition: "opacity 0.7s ease-in-out",
          overflow: "hidden",
        }}
      >

        {/* Blurred orbs */}
        <div style={{
          position:"absolute", width:420, height:420,
          borderRadius:"50%",
          background:"radial-gradient(circle, rgba(34,197,94,0.28) 0%, transparent 70%)",
          filter:"blur(60px)", top:"10%", left:"5%",
          animation:"orb-drift-1 7s ease-in-out infinite",
        }} />
        <div style={{
          position:"absolute", width:360, height:360,
          borderRadius:"50%",
          background:"radial-gradient(circle, rgba(59,130,246,0.22) 0%, transparent 70%)",
          filter:"blur(55px)", bottom:"8%", right:"4%",
          animation:"orb-drift-2 9s ease-in-out infinite",
        }} />
        <div style={{
          position:"absolute", width:280, height:280,
          borderRadius:"50%",
          background:"radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)",
          filter:"blur(45px)", bottom:"20%", left:"15%",
          animation:"orb-drift-3 11s ease-in-out infinite",
        }} />

        {/* Content */}
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", gap:24,
          opacity: phase === "in" ? 0 : 1,
          transform: phase === "in" ? "scale(0.96) translateY(12px)" : "scale(1) translateY(0)",
          transition: "opacity 0.6s ease, transform 0.6s ease",
        }}>

          {/* Title */}
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.3em",
            textTransform: "uppercase", margin: 0,
            background: "linear-gradient(90deg, #4ade80, #86efac, #22d3ee, #86efac, #4ade80)",
            backgroundSize: "400px 100%",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            animation: "shimmer 3s linear infinite",
          }}>
            Prezi Betting Tools
          </p>

          {/* Image with rings */}
          <div style={{ position:"relative", width:220, height:220 }}>
            {/* outer glow ring */}
            <div style={{
              position:"absolute", inset:-16,
              borderRadius:"50%",
              border:"2px solid rgba(74,222,128,0.35)",
              animation:"ring-pulse-2 3s ease-in-out infinite",
            }} />
            {/* inner glow ring */}
            <div style={{
              position:"absolute", inset:-6,
              borderRadius:"50%",
              border:"1.5px solid rgba(74,222,128,0.6)",
              boxShadow:"0 0 24px rgba(74,222,128,0.3), inset 0 0 24px rgba(74,222,128,0.08)",
              animation:"ring-pulse 2.5s ease-in-out infinite",
            }} />
            <img
              src="/greenlover.jpg"
              alt="Prezi"
              style={{
                width:"100%", height:"100%",
                borderRadius:"50%", objectFit:"cover",
                boxShadow:"0 0 60px rgba(34,197,94,0.25), 0 0 120px rgba(34,197,94,0.1)",
              }}
            />
          </div>

        </div>
      </div>
    </>
  );
}
