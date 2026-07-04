import { useEffect, useState } from "react";
import type {
  AvatarInfo,
  FormatDefinition,
  MatchDetail,
  MatchEvent,
  MatchState,
  PrepEvent,
  SealEvent,
  SpeechEvent,
  TeamKey,
  ThinkingInfo,
  VoteEvent,
} from "@debate-koshien/shared";
import { partLabel, partShortLabel, sideLabel, teamOfSide } from "@debate-koshien/shared";
import { fetchFormats } from "../api";
import { Art } from "../art/Art";
import { FbGavel, FbMagnifier, FbPrepEnvelope, FbSealStamp } from "../art/fallbacks";
import { useLang, useT } from "../i18n";
import { EvidencePanel } from "./EvidencePanel";
import { LogView } from "./LogView";
import { Stage } from "./Stage";

function snippet(text: string, max = 44): string {
  const plain = text.replace(/\[[AN]-\d{2}\]/g, "").replace(/\s+/g, " ").trim();
  const chars = [...plain];
  return chars.length <= max ? plain : chars.slice(0, max).join("") + "…";
}

/** Preparation-phase overlay (envelope + progress + seal stamp). */
function PrepPanel({ detail, events, replaying }: { detail: MatchDetail; events: MatchEvent[]; replaying: boolean }) {
  const t = useT();
  const { lang } = useLang();
  const teamCard = (team: TeamKey) => {
    const side = detail.config.affirmative === team ? "affirmative" : "negative";
    const tone = side === "affirmative" ? "aff" : "neg";
    const statuses = events.filter((e): e is PrepEvent => e.type === "prep" && e.team === team);
    // The seal display follows the paced events (so the stamp does not appear early during replay).
    const seal = events.find((e): e is SealEvent => e.type === "seal" && e.team === team);
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
          <div className="tent-team">{t.arena.teamLine(sideLabel(side, lang), detail.config.teams[team].name)}</div>
          <div className="tent-status">
            {seal ? t.arena.sealed : (latest?.status ?? t.arena.waiting)}
            {!seal && <span className="dots" />}
          </div>
          {seal && (
            <div className="tent-hash">
              <span className="hash-label">SHA-256</span>
              <code className="hash">{seal.rootHash.slice(0, 20)}…</code>
            </div>
          )}
          <details className="tent-log">
            <summary>{t.arena.workLog}</summary>
            <ul>
              {statuses.map((s) => (
                <li key={s.seq}>
                  {s.status}
                  <span className="prep-time">{new Date(s.at).toLocaleTimeString(t.common.localeString)}</span>
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
      <div className="prep-note paper">{replaying ? t.arena.prepNoteReplay : t.arena.prepNoteLive}</div>
      <div className="prep-tents">
        {teamCard(detail.config.affirmative)}
        {teamCard(detail.config.affirmative === "A" ? "B" : "A")}
      </div>
    </div>
  );
}

/** Bottom progress bar (part dots + current status). */
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
  const t = useT();
  const { lang } = useLang();
  const speeches = events.filter((e): e is SpeechEvent => e.type === "speech");
  const donePartIds = new Set(speeches.map((s) => s.partId));
  const currentPartId = speeches.at(-1)?.partId;
  const phase = state?.phase;
  const waitingText = state?.progress?.trim();

  return (
    <div className="arena-bottombar">
      <div className="progress-parts">
        <span className="bar-label">{t.arena.progress}</span>
        {format?.parts.map((p) => {
          const status = p.id === currentPartId && phase === "debating" ? "current" : donePartIds.has(p.id) ? "done" : "todo";
          return (
            <span key={p.id} className={`part-dot ${status} ${p.side === "affirmative" ? "aff" : "neg"}`} title={partLabel(p.id, lang)}>
              <i />
              <em>{partShortLabel(p.id, lang)}</em>
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
            {t.arena.judging(votes.length, judgeTotal)}
          </span>
        )}
      </div>
    </div>
  );
}

export function ArenaScreen({
  matchId,
  detail,
  events,
  state,
  thinking,
  avatars,
  audioOn,
  finishedIds,
  onSpeechDone,
  replaying = false,
}: {
  matchId: string;
  detail: MatchDetail;
  events: MatchEvent[];
  state: MatchState | null;
  /** Real-time thinking info (always the latest, separate from the presentation-paced state). */
  thinking?: Record<string, ThinkingInfo>;
  avatars: Map<string, AvatarInfo>;
  audioOn: boolean;
  finishedIds: Set<string>;
  onSpeechDone: (id: string) => void;
  /** Whether replay (demo playback) is active. Used for the prep panel wording, etc. */
  replaying?: boolean;
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
        thinking={thinking}
      />

      <ProgressBar format={format} events={events} state={state} votes={votes} judgeTotal={detail.config.judges.length} />

      {inPrep ? (
        <PrepPanel detail={detail} events={events} replaying={replaying} />
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
    </div>
  );
}
