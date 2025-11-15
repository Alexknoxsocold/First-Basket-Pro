import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";

interface ParlayOption {
  id: string;
  player: string;
  team: string;
  opponent: string;
  percentage: number;
}

export default function Parlays() {
  const [selectedPicks, setSelectedPicks] = useState<string[]>([]);

  const parlayOptions: ParlayOption[] = [
    { id: "1", player: "J. Allen", team: "CLE", opponent: "vs MEM", percentage: 64 },
    { id: "2", player: "D. Ayton", team: "LAL", opponent: "vs MIL", percentage: 58 },
    { id: "3", player: "C. Holmgren", team: "OKC", opponent: "vs CHA", percentage: 67 },
    { id: "4", player: "J. Poeltl", team: "TOR", opponent: "vs IND", percentage: 63 },
    { id: "5", player: "R. Gobert", team: "MIN", opponent: "vs DEN", percentage: 58 },
  ];

  const togglePick = (id: string) => {
    setSelectedPicks(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const calculateParlay = () => {
    if (selectedPicks.length === 0) return 0;
    const picks = parlayOptions.filter(p => selectedPicks.includes(p.id));
    const combinedOdds = picks.reduce((acc, pick) => acc * (pick.percentage / 100), 1);
    return (combinedOdds * 100).toFixed(2);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">First Basket Parlay Builder</h2>
        <p className="text-sm text-muted-foreground">
          Select multiple players to build your first basket parlay
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold">Available Picks</h3>
          {parlayOptions.map((option) => (
            <Card
              key={option.id}
              className={selectedPicks.includes(option.id) ? "border-primary" : ""}
              data-testid={`card-parlay-option-${option.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Checkbox
                    checked={selectedPicks.includes(option.id)}
                    onCheckedChange={() => togglePick(option.id)}
                    data-testid={`checkbox-pick-${option.id}`}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" data-testid={`text-player-${option.id}`}>{option.player}</span>
                      <Badge variant="secondary" className="text-xs">{option.team}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">{option.opponent}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-lg" data-testid={`text-percentage-${option.id}`}>{option.percentage}%</div>
                    <div className="text-xs text-muted-foreground">Tip Win %</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="lg:col-span-1">
          <Card className="sticky top-24" data-testid="card-parlay-ticket">
            <CardHeader>
              <CardTitle className="text-base">Parlay Ticket</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedPicks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Plus className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  Select picks to build your parlay
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {selectedPicks.map((pickId) => {
                      const pick = parlayOptions.find(p => p.id === pickId);
                      if (!pick) return null;
                      return (
                        <div
                          key={pickId}
                          className="flex items-center justify-between p-2 bg-muted rounded"
                          data-testid={`parlay-pick-${pickId}`}
                        >
                          <div>
                            <div className="text-sm font-medium">{pick.player}</div>
                            <div className="text-xs text-muted-foreground">{pick.team}</div>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => togglePick(pickId)}
                            data-testid={`button-remove-${pickId}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm">Legs</span>
                      <span className="font-mono font-bold" data-testid="text-legs-count">{selectedPicks.length}</span>
                    </div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm">Combined Probability</span>
                      <span className="font-mono font-bold text-lg" data-testid="text-combined-probability">{calculateParlay()}%</span>
                    </div>
                    <Button className="w-full" data-testid="button-place-parlay">
                      Build Parlay
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
