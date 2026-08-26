import { useEffect } from "react";
import WNBA from "./WNBA";

const STRONGEST_TITLE = "Strongest WNBA plays";
const STRONGEST_COPY = "Only each game's #1 Best Play and #2 Strong Play appear when model probability is at least 10%. Market Value remains separate and only appears when real odds clear the edge/EV threshold.";

export default function WNBAHiddenHistory() {
  useEffect(() => {
    const root = document.querySelector(".wnba-mobile-nav-fix");
    if (!root) return;

    const cleanHiddenWnbaUi = () => {
      for (const el of Array.from(root.querySelectorAll("div,p,h1,h2,h3,h4"))) {
        const text = el.textContent?.trim() ?? "";
        if (text !== STRONGEST_TITLE && text !== STRONGEST_COPY) continue;

        let block: HTMLElement | null = el as HTMLElement;
        while (block && block !== root) {
          const blockText = block.textContent?.trim() ?? "";
          if (blockText.includes(STRONGEST_TITLE) && blockText.includes(STRONGEST_COPY) && blockText.length < 700) {
            block.style.display = "none";
            break;
          }
          block = block.parentElement;
        }
      }

      // WNBA Props is intentionally removed from the product UI.
      for (const button of Array.from(root.querySelectorAll("button"))) {
        if (button.textContent?.trim() === "WNBA Props") {
          (button as HTMLElement).style.display = "none";
        }
      }
    };

    cleanHiddenWnbaUi();
    const observer = new MutationObserver(cleanHiddenWnbaUi);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <style>{`
        .wnba-mobile-nav-fix button:has(svg.lucide-history) { display: none !important; }
        .wnba-mobile-nav-fix button:has(svg.lucide-refresh-cw) { display: none !important; }
        .wnba-mobile-nav-fix button:has(svg.lucide-trending-up) { display: none !important; }

        /* Remove the WNBA page intro/title copy above the content. */
        .wnba-mobile-nav-fix .mb-5.flex.flex-wrap.items-end.justify-between.gap-3 {
          display: none !important;
        }

        /* Remove the Opening Tips explanatory card. */
        .wnba-mobile-nav-fix .mb-4.rounded-xl.border.bg-card.p-4.shadow-sm {
          display: none !important;
        }

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
          .wnba-mobile-nav-fix nav button:has(svg.lucide-trending-up) {
            display: none !important;
          }
        }
      `}</style>
      <div className="wnba-mobile-nav-fix">
        <WNBA />
      </div>
    </>
  );
}
