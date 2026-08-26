import { useEffect } from "react";
import WNBA from "./WNBA";

const CLEARER_COPY = "A clearer game-by-game view of opening possession, model probability, verified first-basket history, and live market value when available.";
const OPENING_TIPS_TITLE = "WNBA Opening Tips";
const OPENING_TIPS_COPY = "Jump-ball matchups, verified tip rates, projected first possession, and confidence from the same opening-tip data used by the First Basket model.";

export default function WNBAHiddenHistory() {
  useEffect(() => {
    const root = document.querySelector(".wnba-mobile-nav-fix");
    if (!root) return;

    const hideIntroCopy = () => {
      for (const el of Array.from(root.querySelectorAll("p"))) {
        if (el.textContent?.trim() === CLEARER_COPY) {
          const parent = el.parentElement;
          if (parent && (parent.textContent?.trim().length ?? 0) < 500) parent.style.display = "none";
          else (el as HTMLElement).style.display = "none";
        }
      }

      for (const heading of Array.from(root.querySelectorAll("h1,h2,h3,h4"))) {
        if (heading.textContent?.trim() !== OPENING_TIPS_TITLE) continue;
        let block = heading.parentElement;
        while (block && block !== root) {
          const text = block.textContent?.trim() ?? "";
          if (text.includes(OPENING_TIPS_COPY) && text.length < 700) {
            block.style.display = "none";
            break;
          }
          block = block.parentElement;
        }
      }
    };

    hideIntroCopy();
    const observer = new MutationObserver(hideIntroCopy);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        button:has(> svg.lucide-history) { display: none !important; }
        button:has(> svg.lucide-refresh-cw) { display: none !important; }
        @media (max-width: 640px) {
          .wnba-mobile-nav-fix nav {
            padding-top: 4px !important;
          }
          .wnba-mobile-nav-fix nav button {
            min-height: 48px !important;
            padding-top: 14px !important;
            padding-bottom: 12px !important;
            display: inline-flex !important;
            align-items: center !important;
          }
        }
      `}</style>
      <div className="wnba-mobile-nav-fix">
        <WNBA />
      </div>
    </>
  );
}
