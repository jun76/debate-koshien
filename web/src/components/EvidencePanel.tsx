import { useEffect, useRef, useState } from "react";
import type { HandoutResponse, MatchConfig, TeamKey } from "@debate/shared";
import { SIDE_LABEL, sideOfTeam } from "@debate/shared";
import { fetchHandout } from "../api";

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

  // 発言ログの証拠チップをクリックしたらタブを切り替えて該当エントリへスクロール
  useEffect(() => {
    if (!selected) return;
    setTab(selected.team);
    const el = document.getElementById(`evidence-${selected.team}-${selected.id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selected]);

  const h = handouts[tab];

  return (
    <div className="evidence-panel">
      <div className="log-head">
        <h3>証拠資料</h3>
        <div className="tabs">
          {(["A", "B"] as TeamKey[]).map((team) => (
            <button
              key={team}
              className={`tab ${tab === team ? "active" : ""} ${sideOfTeam(config, team) === "affirmative" ? "aff" : "neg"}`}
              onClick={() => setTab(team)}
            >
              {SIDE_LABEL[sideOfTeam(config, team)]}（{config.teams[team].name}）
            </button>
          ))}
        </div>
      </div>
      {!sealed[tab] && <div className="empty">封印前のため閲覧できません</div>}
      {sealed[tab] && !h && <div className="empty">読み込み中…</div>}
      {h && (
        <div ref={listRef} className="evidence-list">
          {h.seal && (
            <div className="seal-info">
              封印ハッシュ <code className="hash">{h.seal.rootHash.slice(0, 16)}…</code>
              <span className="seal-time">{new Date(h.seal.sealedAt).toLocaleString("ja-JP")}</span>
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
                      出典
                    </a>
                  </>
                )}
              </div>
            </div>
          ))}
          <details className="handout-raw">
            <summary>handout.md 全文</summary>
            <pre>{h.handout}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
