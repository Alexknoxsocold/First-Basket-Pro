import WNBA from "./WNBA";

export default function WNBAHiddenHistory() {
  return (
    <>
      <style>{`
        .wnba-mobile-nav-fix button:has(svg.lucide-history) { display: none !important; }
        .wnba-mobile-nav-fix button:has(svg.lucide-refresh-cw) { display: none !important; }

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
        }
      `}</style>
      <div className="wnba-mobile-nav-fix">
        <WNBA />
      </div>
    </>
  );
}
