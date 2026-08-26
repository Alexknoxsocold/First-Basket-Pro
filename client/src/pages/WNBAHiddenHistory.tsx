import WNBA from "./WNBA";

export default function WNBAHiddenHistory() {
  return (
    <>
      <style>{`button:has(> svg.lucide-history) { display: none !important; }`}</style>
      <WNBA />
    </>
  );
}
