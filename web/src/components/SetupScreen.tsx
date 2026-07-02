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

/** 設定画面（ロビー）。チーム編成ウィザードと過去試合のチケット一覧。 */
export function SetupScreen({
  matches,
  onOpen,
  onCreated,
  loadError,
}: {
  matches: MatchSummary[];
  onOpen: (id: string) => void;
  onCreated: (id: string) => void;
  loadError: string | null;
}) {
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
            <button
              key={m.id}
              className="ticket pop-in"
              style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
              type="button"
              onClick={() => onOpen(m.id)}
            >
              <span className={`phase-pill ${phaseTone(m.phase)}`}>{PHASE_LABEL[m.phase]}</span>
              <span className="ticket-topic">{m.topic}</span>
              <span className="ticket-date">{new Date(m.createdAt).toLocaleString("ja-JP")}</span>
            </button>
          ))}
        </aside>

        <div className="lobby-main">
          <Wizard onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
