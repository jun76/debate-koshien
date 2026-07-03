import { useCallback, useEffect, useState } from "react";
import type { MatchSummary } from "@debate/shared";
import { deleteMatch, fetchMatches } from "./api";
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
  const [replay, setReplay] = useState<boolean>(() => new URLSearchParams(location.search).get("replay") === "1");
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

  const openMatch = (id: string, opts?: { replay?: boolean }) => {
    const asReplay = opts?.replay ?? false;
    setMatchId(id);
    setReplay(asReplay);
    history.replaceState(null, "", `?match=${encodeURIComponent(id)}${asReplay ? "&replay=1" : ""}`);
  };

  const exitToSetup = () => {
    setMatchId(null);
    setReplay(false);
    history.replaceState(null, "", location.pathname);
    refreshMatches();
  };

  const removeMatch = async (id: string) => {
    await deleteMatch(id);
    if (matchId === id) {
      setMatchId(null);
      setReplay(false);
      history.replaceState(null, "", location.pathname);
    }
    refreshMatches();
  };

  return (
    <div className="app-root">
      {matchId ? (
        <MatchContainer
          id={matchId}
          replay={replay}
          onExit={exitToSetup}
          onReplay={() => openMatch(matchId, { replay: true })}
        />
      ) : (
        <SetupScreen matches={matches} onOpen={openMatch} onDeleted={removeMatch} onCreated={openMatch} loadError={loadError} />
      )}
    </div>
  );
}
