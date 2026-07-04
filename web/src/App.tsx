import { useCallback, useEffect, useState } from "react";
import type { MatchSummary } from "@debate-koshien/shared";
import { deleteMatch, fetchMatches } from "./api";
import { MatchContainer } from "./components/MatchContainer";
import { SetupScreen } from "./components/SetupScreen";

/**
 * Root of the three-screen flow:
 *   Setup (lobby) -> Arena (watch the match) -> Result & review.
 * Switching between arena and result happens inside MatchContainer.
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
