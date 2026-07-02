import { useCallback, useEffect, useState } from "react";
import type { MatchSummary } from "@debate/shared";
import { fetchMatches } from "./api";
import { MatchContainer } from "./components/MatchContainer";
import { SetupScreen } from "./components/SetupScreen";

/**
 * 3画面構成のルート。
 *   設定（ロビー） → アリーナ（試合観戦） → 結果と講評
 * アリーナと結果の切り替えは MatchContainer 内で行う。
 */
export function App() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [matchId, setMatchId] = useState<string | null>(() => new URLSearchParams(location.search).get("match"));
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshMatches = useCallback(() => {
    fetchMatches()
      .then((items) => {
        setMatches(items);
        setLoadError(null);
      })
      .catch((e) => setLoadError(String(e instanceof Error ? e.message : e)));
  }, []);

  useEffect(() => {
    refreshMatches();
  }, [refreshMatches]);

  const openMatch = (id: string) => {
    setMatchId(id);
    history.replaceState(null, "", `?match=${encodeURIComponent(id)}`);
  };

  const exitToSetup = () => {
    setMatchId(null);
    history.replaceState(null, "", location.pathname);
    refreshMatches();
  };

  return (
    <div className="app-root">
      {matchId ? (
        <MatchContainer id={matchId} onExit={exitToSetup} />
      ) : (
        <SetupScreen matches={matches} onOpen={openMatch} onCreated={openMatch} loadError={loadError} />
      )}
    </div>
  );
}
