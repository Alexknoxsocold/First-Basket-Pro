import { useQuery } from "@tanstack/react-query";

type WikiSummary = {
  thumbnail?: { source?: string };
  originalimage?: { source?: string };
};

const NBA_ARENAS: Record<string, string> = {
  ATL: "State Farm Arena",
  BOS: "TD Garden",
  BKN: "Barclays Center",
  CHA: "Spectrum Center",
  CHI: "United Center",
  CLE: "Rocket Arena",
  DAL: "American Airlines Center",
  DEN: "Ball Arena",
  DET: "Little Caesars Arena",
  GS: "Chase Center",
  GSW: "Chase Center",
  HOU: "Toyota Center (Houston)",
  IND: "Gainbridge Fieldhouse",
  LAC: "Intuit Dome",
  LAL: "Crypto.com Arena",
  MEM: "FedExForum",
  MIA: "Kaseya Center",
  MIL: "Fiserv Forum",
  MIN: "Target Center",
  NO: "Smoothie King Center",
  NOP: "Smoothie King Center",
  NYK: "Madison Square Garden",
  OKC: "Paycom Center",
  ORL: "Kia Center",
  PHI: "Wells Fargo Center (Philadelphia)",
  PHX: "Footprint Center",
  POR: "Moda Center",
  SAC: "Golden 1 Center",
  SA: "Frost Bank Center",
  SAS: "Frost Bank Center",
  TOR: "Scotiabank Arena",
  UTAH: "Delta Center",
  UTA: "Delta Center",
  WSH: "Capital One Arena",
  WAS: "Capital One Arena",
};

export function getNbaArenaName(team: string): string | null {
  return NBA_ARENAS[team.toUpperCase()] ?? null;
}

export default function NbaArenaBackdrop({ team }: { team: string }) {
  const venue = getNbaArenaName(team);
  const { data } = useQuery<WikiSummary>({
    queryKey: ["nba-arena-backdrop", venue],
    enabled: Boolean(venue),
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
    retry: 0,
    queryFn: async () => {
      const response = await fetch(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(venue!)}`,
      );
      if (!response.ok) throw new Error("NBA arena image unavailable");
      return response.json() as Promise<WikiSummary>;
    },
  });

  const image = data?.originalimage?.source ?? data?.thumbnail?.source;
  if (!image) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
      <img
        src={image}
        alt=""
        className="h-full w-full scale-110 object-cover opacity-[0.20] blur-[5px] saturate-[0.82]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/58 via-background/76 to-background/94" />
      <div className="absolute inset-0 bg-gradient-to-r from-background/50 via-transparent to-background/50" />
    </div>
  );
}
