import { useEffect, useState } from "react";
import type {
  AvatarInfo,
  FormatDefinition,
  MatchDetail,
  MatchEvent,
  MatchState,
  PrepEvent,
  SpeechEvent,
  TeamKey,
  VoteEvent,
} from "@debate/shared";
import { SIDE_LABEL, teamOfSide } from "@debate/shared";
import { fetchFormats } from "../api";
import { Art } from "../art/Art";
import { FbGavel, FbMagnifier, FbPrepEnvelope, FbSealStamp } from "../art/fallbacks";
import { EvidencePanel } from "./EvidencePanel";
import { LogView } from "./LogView";
import { Stage } from "./Stage";

function snippet(text: string, max = 44): string {
  const plain = text.replace(/\[[AN]-\d{2}\]/g, "").replace(/\s+/g, " ").trim();
  const chars = [...plain];
  return chars.length <= max ? plain : chars.slice(0, max).join("") + "…";
}

/** 準備フェーズのオーバーレイ（封筒 + 進行状況 + 封印スタンプ） */
function PrepPanel({ detail, events }: { detail: MatchDetail; events: MatchEvent[] }) {
  const teamCard = (team: TeamKey) => {
    const side = detail.config.affirmative === team ? "affirmative" : "negative";
    const tone = side === "affirmative" ? "aff" : "neg";
    const statuses = events.filter((e): e is PrepEvent => e.type === "prep" && e.team === team);
    const seal = detail.seals[team];
    const latest = statuses.at(-1);
    return (
      <div className={`prep-tent-card tone-${tone} pop-in`} key={team}>
        <div className="tent-art-wrap">
          <Art name={`prep-envelope-${tone}`} className="tent-art" fallback={<FbPrepEnvelope tone={tone} sealed={Boolean(seal)} />} />
          {!seal && (
            <div className="tent-magnifier sway">
              <Art name="magnifier" className="magnifier-art" fallback={<FbMagnifier />} />
            </div>
          )}
          {seal && (
            <div className="tent-stamp stamp-in">
              <Art name="seal-stamp" className="stamp-art" fallback={<FbSealStamp />} />
            </div>
          )}
        </div>
        <div className="tent-info">
          <div className="tent-team">
            {SIDE_LABEL[side]}・{detail.config.teams[team].name}
          </div>
          <div className="tent-status">
            {seal ? "ハンドアウト封印済み" : (latest?.status ?? "待機中…")}
            {!seal && <span className="dots" />}
          </div>
          {seal && (
            <div className="tent-hash">
              <span className="hash-label">SHA-256</span>
              <code className="hash">{seal.rootHash.slice(0, 20)}…</code>
            </div>
          )}
          <details className="tent-log">
            <summary>作業記録</summary>
            <ul>
              {statuses.map((s) => (
                <li key={s.seq}>
                  {s.status}
                  <span className="prep-time">{new Date(s.at).toLocaleTimeString("ja-JP")}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    );
  };

  return (
    <div className="prep-panel">
      <div className="prep-note paper">
        📚 準備フェーズ — 両チームが独立に Web 調査を行い、封印用ハンドアウトを作成中。封印後は Web 利用が実行権限で禁止されます
      </div>
      <div className="prep-tents">
        {teamCard(detail.config.affirmative)}
        {teamCard(detail.config.affirmative === "A" ? "B" : "A")}
      </div>
    </div>
  );
}

/** 下部の進行バー（パートのドット + 現在の状況） */
function ProgressBar({
  format,
  events,
  state,
  votes,
  judgeTotal,
}: {
  format: FormatDefinition | null;
  events: MatchEvent[];
  state: MatchState | null;
  votes: VoteEvent[];
  judgeTotal: number;
}) {
  const speeches = events.filter((e): e is SpeechEvent => e.type === "speech");
  const donePartIds = new Set(speeches.map((s) => s.partId));
  const currentPartId = speeches.at(-1)?.partId;
  const phase = state?.phase;
  const waitingText = state?.progress?.trim();

  return (
    <div className="arena-bottombar paper">
      <div className="progress-parts">
        <span className="bar-label">進行</span>
        {format?.parts.map((p) => {
          const status = p.id === currentPartId && phase === "debating" ? "current" : donePartIds.has(p.id) ? "done" : "todo";
          return (
            <span key={p.id} className={`part-dot ${status} ${p.side === "affirmative" ? "aff" : "neg"}`} title={p.label}>
              <i />
              <em>{p.label.replace(/側/, "")}</em>
            </span>
          );
        })}
      </div>
      <div className="bar-right">
        {waitingText && phase !== "finished" && phase !== "aborted" && (
          <span className="thinking-chip">
            <span className="thinking-pulse" />
            {waitingText}
          </span>
        )}
        {phase === "judging" && (
          <span className="judging-chip">
            <span className="gavel-mini">
              <Art name="gavel" className="gavel-art" fallback={<FbGavel />} />
            </span>
            審査中 {votes.length}/{judgeTotal}
          </span>
        )}
        <span className="bar-progress">{state?.progress ?? ""}</span>
      </div>
    </div>
  );
}

export function ArenaScreen({
  matchId,
  detail,
  events,
  state,
  avatars,
  audioOn,
  finishedIds,
  onSpeechDone,
}: {
  matchId: string;
  detail: MatchDetail;
  events: MatchEvent[];
  state: MatchState | null;
  avatars: Map<string, AvatarInfo>;
  audioOn: boolean;
  finishedIds: Set<string>;
  onSpeechDone: (id: string) => void;
}) {
  const [selectedEvidence, setSelectedEvidence] = useState<{ team: TeamKey; id: string } | null>(null);
  const [formats, setFormats] = useState<FormatDefinition[]>([]);

  useEffect(() => {
    fetchFormats().then(setFormats).catch(() => undefined);
  }, []);

  const phase = state?.phase ?? detail.state.phase;
  const format = formats.find((f) => f.id === detail.config.formatId) ?? null;
  const speeches = events.filter((e): e is SpeechEvent => e.type === "speech");
  const votes = events.filter((e): e is VoteEvent => e.type === "vote");
  const latestSpeech = speeches.at(-1) ?? null;
  const activeSpeech = latestSpeech && !finishedIds.has(latestSpeech.id) ? latestSpeech : null;
  const sealed: Record<TeamKey, boolean> = { A: Boolean(detail.seals.A), B: Boolean(detail.seals.B) };
  const inPrep = phase === "setup" || phase === "preparing" || phase === "sealed";
  const resolveCitationTeam = (evidenceId: string, fallback: TeamKey) => {
    if (evidenceId.startsWith("A-")) return teamOfSide(detail.config, "affirmative");
    if (evidenceId.startsWith("N-")) return teamOfSide(detail.config, "negative");
    return fallback;
  };

  const signTexts: Record<TeamKey, string | null> = { A: null, B: null };
  for (const team of ["A", "B"] as TeamKey[]) {
    const last = speeches.filter((s) => s.team === team).at(-1);
    signTexts[team] = last ? snippet(last.text) : null;
  }

  return (
    <div className="arena-screen">
      <Stage
        config={detail.config}
        avatars={avatars}
        speakingSpeakerId={activeSpeech?.speakerId ?? null}
        speakingTeam={activeSpeech?.team ?? null}
        topic={detail.config.topic}
        signTexts={signTexts}
      />

      {inPrep ? (
        <PrepPanel detail={detail} events={events} />
      ) : (
        <div className="watch-grid">
          <LogView
            matchId={matchId}
            events={events}
            audioOn={audioOn}
            finishedIds={finishedIds}
            onSpeechDone={onSpeechDone}
            resolveCitationTeam={resolveCitationTeam}
            onCite={(team, evidenceId) => setSelectedEvidence({ team, id: evidenceId })}
          />
          <EvidencePanel
            matchId={matchId}
            config={detail.config}
            sealed={sealed}
            selected={selectedEvidence}
            onSelect={setSelectedEvidence}
          />
        </div>
      )}

      <ProgressBar format={format} events={events} state={state} votes={votes} judgeTotal={detail.config.judges.length} />
    </div>
  );
}
