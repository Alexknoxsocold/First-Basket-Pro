import WNBA from "./WNBA";

export default function WNBAHiddenHistory() {
  return (
    <>
      <style>{`
        button:has(> svg.lucide-history) { display: none !important; }
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
