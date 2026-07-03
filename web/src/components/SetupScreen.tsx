import { useState } from "react";
import type { MatchSummary, Phase } from "@debate/shared";
import { Art } from "../art/Art";
import { FbGavel, FbTrophy } from "../art/fallbacks";
import { Wizard } from "./Wizard";

export const PHASE_LABEL: Record<Phase, string> = {
  setup: "未開始",
  preparing: "準備中",
  sealed: "封印済み",
  debating: "試合中",
  judging: "審査中",
  reviewing: "講評中",
  finished: "終了",
  aborted: "中断",
  error: "エラー",
};

export function phaseTone(phase: Phase): string {
  if (phase === "finished") return "done";
  if (phase === "aborted" || phase === "error") return "bad";
  if (phase === "setup" || phase === "sealed") return "idle";
  return "live";
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** 設定画面（ロビー）。チーム編成ウィザードと過去試合のチケット一覧。 */
export function SetupScreen({
  matches,
  onOpen,
  onDeleted,
  onCreated,
  loadError,
}: {
  matches: MatchSummary[];
  onOpen: (id: string) => void;
  onDeleted: (id: string) => Promise<void>;
  onCreated: (id: string) => void;
  loadError: string | null;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const doDelete = async (match: MatchSummary) => {
    if (!confirm(`「${match.topic}」を削除しますか？\n関連データ一式も data フォルダから削除されます。`)) return;
    setDeletingId(match.id);
    try {
      await onDeleted(match.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="setup-screen">
      <div className="lobby-title wobble-soft">
        <div className="lobby-deco left">
          <Art name="gavel" className="deco-art" fallback={<FbGavel />} />
        </div>
        <div>
          <div className="lobby-kicker">コーディングエージェント対抗</div>
          <h1>AIディベート甲子園</h1>
          <div className="lobby-sub">調査・証拠・反駁・審査 — ぜんぶエージェント</div>
        </div>
        <div className="lobby-deco right">
          <Art name="trophy" className="deco-art" fallback={<FbTrophy />} />
        </div>
      </div>

      {loadError && <div className="error-box">{loadError}</div>}

      <div className="lobby-layout">
        <aside className="ticket-rail">
          <div className="rail-title">過去の試合</div>
          {matches.length === 0 && <div className="empty">まだ試合はありません</div>}
          {matches.map((m, i) => (
            <div
              key={m.id}
              className="ticket pop-in"
              style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(m.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onOpen(m.id);
              }}
            >
              <button
                type="button"
                className="ticket-delete"
                aria-label="試合を削除"
                title="試合を削除"
                onClick={(e) => {
                  e.stopPropagation();
                  void doDelete(m);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void doDelete(m);
                }}
              >
                {deletingId === m.id ? "…" : <TrashIcon />}
              </button>
              <span className={`phase-pill ${phaseTone(m.phase)}`}>{PHASE_LABEL[m.phase]}</span>
              <span className="ticket-topic">{m.topic}</span>
              <span className="ticket-date">{new Date(m.createdAt).toLocaleString("ja-JP")}</span>
            </div>
          ))}
        </aside>

        <div className="lobby-main">
          <Wizard onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
