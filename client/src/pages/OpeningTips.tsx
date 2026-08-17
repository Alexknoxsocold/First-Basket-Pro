import { useQuery } from "@tanstack/react-query";
import GamesTable from "@/components/GamesTable";
import { Skeleton } from "@/components/ui/skeleton";
import type { Game } from "@shared/schema";

export default function OpeningTips() {
  const { data: games, isLoading } = useQuery<Game[]>({
    queryKey: ["/api/games"],
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-20" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Opening Tip Statistics</h2>
        <p className="text-sm text-muted-foreground">
          Projected jump ball winners and first team to score probabilities
        </p>
      </div>

      <GamesTable games={games || []} />
    </div>
  );
}
