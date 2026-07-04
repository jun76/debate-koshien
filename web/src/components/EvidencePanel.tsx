import { useEffect, useRef, useState } from "react";
import type { HandoutResponse, MatchConfig, TeamKey } from "@debate/shared";
import { sideLabel, sideOfTeam } from "@debate/shared";
import { fetchHandout } from "../api";
import { useLang, useT } from "../i18n";

export function EvidencePanel({
  matchId,
  config,
  sealed,
  selected,
  onSelect,
}: {
  matchId: string;
  config: MatchConfig;
  sealed: Record<TeamKey, boolean>;
  selected: { team: TeamKey; id: string } | null;
  onSelect: (sel: { team: TeamKey; id: string } | null) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [tab, setTab] = useState<TeamKey>("A");
  const [handouts, setHandouts] = useState<Partial<Record<TeamKey, HandoutResponse>>>({});
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    for (const team of ["A", "B"] as TeamKey[]) {
      if (sealed[team] && !handouts[team]) {
        fetchHandout(matchId, team)
          .then((h) => setHandouts((prev) => ({ ...prev, [team]: h })))
          .catch(() => undefined);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, sealed.A, sealed.B]);

  // Clicking an evidence chip in the log switches the tab and scrolls to that entry.
  // Switching and scrolling must happen on separate renders: right after setTab the other
  // tab's list is not in the DOM yet, so scroll once the effect re-runs with the tab (and,
  // if still loading, the handout data) in place.
  useEffect(() => {
    if (!selected) return;
    if (tab !== selected.team) {
      setTab(selected.team);
      return;
    }
    const el = document.getElementById(`evidence-${selected.team}-${selected.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected, tab, handouts]);

  const h = handouts[tab];

  return (
    <div className="evidence-panel">
      <div className="log-head">
        <h3>{t.evidence.heading}</h3>
        <div className="tabs">
          {(["A", "B"] as TeamKey[]).map((team) => (
            <button
              key={team}
              className={`tab ${tab === team ? "active" : ""} ${sideOfTeam(config, team) === "affirmative" ? "aff" : "neg"}`}
              onClick={() => setTab(team)}
            >
              {t.evidence.tab(sideLabel(sideOfTeam(config, team), lang), config.teams[team].name)}
            </button>
          ))}
        </div>
      </div>
      {!sealed[tab] && <div className="empty">{t.evidence.beforeSeal}</div>}
      {sealed[tab] && !h && <div className="empty">{t.evidence.loading}</div>}
      {h && (
        <div ref={listRef} className="evidence-list">
          {h.seal && (
            <div className="seal-info">
              {t.evidence.sealHash} <code className="hash">{h.seal.rootHash.slice(0, 16)}…</code>
              <span className="seal-time">{new Date(h.seal.sealedAt).toLocaleString(t.common.localeString)}</span>
            </div>
          )}
          {h.evidence.map((e) => (
            <div
              key={e.id}
              id={`evidence-${tab}-${e.id}`}
              className={`evidence-entry ${selected?.team === tab && selected.id === e.id ? "highlight" : ""}`}
              onClick={() => onSelect({ team: tab, id: e.id })}
            >
              <div className="evidence-id">{e.id}</div>
              <div className="evidence-claim">{e.claim}</div>
              <div className="evidence-quote">{e.quote}</div>
              <div className="evidence-source">
                {e.source.title}
                {e.source.publisher && `（${e.source.publisher}）`}
                {e.source.publishedAt && ` ${e.source.publishedAt}`}
                {e.source.url && (
                  <>
                    {" "}
                    <a href={e.source.url} target="_blank" rel="noreferrer">
                      {t.evidence.source}
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
          <details className="handout-raw">
            <summary>{t.evidence.handoutFull}</summary>
            <pre>{h.handout}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
