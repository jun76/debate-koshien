import { useEffect, useRef, useState } from "react";
import type { AudioEvent, DeliberationEvent, MatchEvent, SpeechEvent, TeamKey } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";

/** 証拠参照マーカーをクリック可能なチップに変換して本文を描画する */
function SpeechText({
  text,
  team,
  onCite,
}: {
  text: string;
  team: TeamKey;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const parts = text.split(/(\[[AN]-\d{2}\])/g);
  return (
    <span>
      {parts.map((p, i) => {
        const m = p.match(/^\[([AN]-\d{2})\]$/);
        if (m) {
          return (
            <button key={i} className="cite-chip" onClick={() => onCite(team, m[1])}>
              {m[1]}
            </button>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

function TypewriterSpeech({
  ev,
  matchId,
  audio,
  audioOn,
  isLatest,
  finished,
  onDone,
  onCite,
}: {
  ev: SpeechEvent;
  matchId: string;
  audio?: AudioEvent;
  audioOn: boolean;
  isLatest: boolean;
  finished: boolean;
  onDone: (id: string) => void;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const chars = [...ev.text];
  const [revealed, setRevealed] = useState(finished || !isLatest ? chars.length : 0);
  const [audioTimedOut, setAudioTimedOut] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animate = isLatest && !finished;
  const useAudio = animate && audioOn && audio && !audioTimedOut;
  const waitingAudio = animate && audioOn && !audio && !audioTimedOut;

  useEffect(() => {
    if (finished || !isLatest) {
      setRevealed(chars.length);
      return;
    }
    setRevealed(0);
    setAudioTimedOut(false);
    setAudioStarted(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, finished, isLatest]);

  // 音声なし（または OFF）のタイプライター
  useEffect(() => {
    if (!animate || useAudio || waitingAudio) return;
    const timer = setInterval(() => {
      setRevealed((r) => {
        if (r >= chars.length) {
          clearInterval(timer);
          onDone(ev.id);
          return r;
        }
        return r + 2;
      });
    }, 40);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, useAudio, waitingAudio, ev.id]);

  // 音声待ちタイムアウト（合成が遅い・失敗した場合は文字送りに切り替える）
  useEffect(() => {
    if (!waitingAudio) return;
    const t = setTimeout(() => setAudioTimedOut(true), 45_000);
    return () => clearTimeout(t);
  }, [waitingAudio]);

  // ブラウザの自動再生制限などで隠し audio が進まない場合は文字送りへ切り替える
  useEffect(() => {
    if (!useAudio || audioStarted) return;
    const t = setTimeout(() => setAudioTimedOut(true), 3_000);
    return () => clearTimeout(t);
  }, [useAudio, audioStarted]);

  const visible = revealed >= chars.length ? ev.text : chars.slice(0, revealed).join("");
  const speakerSide = SIDE_LABEL[ev.side];
  const head =
    ev.kind === "question"
      ? `質問 ${(ev.exchangeIndex ?? 0) + 1}`
      : ev.kind === "answer"
        ? `応答 ${(ev.exchangeIndex ?? 0) + 1}`
        : ev.partLabel;

  return (
    <div className={`speech ${ev.side}`}>
      <div className="speech-head">
        <span className={`side-chip ${ev.side === "affirmative" ? "aff" : "neg"}`}>{speakerSide}</span>
        <span className="speech-part">{head}</span>
        <span className="speech-speaker">{ev.speakerName}</span>
        <span className="speech-chars">{ev.chars}字</span>
        {audio && !animate && (
          <audio className="speech-audio" src={`/api/matches/${matchId}/audio/${ev.id}`} controls preload="none" />
        )}
      </div>
      {useAudio && (
        <audio
          ref={audioRef}
          src={`/api/matches/${matchId}/audio/${ev.id}`}
          autoPlay
          onPlay={() => setAudioStarted(true)}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.currentTime > 0) setAudioStarted(true);
            if (audio && audio.durationMs > 0) {
              setRevealed(Math.min(chars.length, Math.ceil((el.currentTime * 1000 * chars.length) / audio.durationMs)));
            }
          }}
          onEnded={() => {
            setRevealed(chars.length);
            onDone(ev.id);
          }}
          onError={() => setAudioTimedOut(true)}
        />
      )}
      <div className="speech-text">
        <SpeechText text={visible} team={ev.team} onCite={onCite} />
        {animate && revealed < chars.length && <span className="caret">▌</span>}
      </div>
      {waitingAudio && <div className="audio-wait">🔊 音声を合成中…</div>}
      {ev.warnings.length > 0 && (
        <div className="warnings">
          {ev.warnings.map((w, i) => (
            <span key={i} className="warning-badge" title={w.detail}>
              ⚠ {w.detail}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function LogView({
  matchId,
  events,
  audioOn,
  finishedIds,
  onSpeechDone,
  onCite,
}: {
  matchId: string;
  events: MatchEvent[];
  audioOn: boolean;
  finishedIds: Set<string>;
  onSpeechDone: (id: string) => void;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const [showDeliberation, setShowDeliberation] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const speeches = events.filter((e): e is SpeechEvent => e.type === "speech");
  const audioMap = new Map(
    events.filter((e): e is AudioEvent => e.type === "audio").map((e) => [e.refId, e]),
  );
  const deliberations = events.filter((e): e is DeliberationEvent => e.type === "deliberation");
  const latestId = speeches.at(-1)?.id;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [events.length]);

  // パートごとの区切りを入れつつ発言と（オプションで）合議ログを時系列で並べる
  const rows: { key: string; node: React.ReactNode }[] = [];
  let lastPart = "";
  const timeline: (SpeechEvent | DeliberationEvent)[] = showDeliberation
    ? [...speeches, ...deliberations].sort((a, b) => a.seq - b.seq)
    : speeches;

  for (const ev of timeline) {
    if (ev.type === "speech" && ev.partId !== lastPart) {
      lastPart = ev.partId;
      rows.push({
        key: `part-${ev.partId}`,
        node: <div className="part-divider">{ev.partLabel}</div>,
      });
    }
    if (ev.type === "speech") {
      rows.push({
        key: ev.id,
        node: (
          <TypewriterSpeech
            ev={ev}
            matchId={matchId}
            audio={audioMap.get(ev.id)}
            audioOn={audioOn}
            isLatest={ev.id === latestId}
            finished={finishedIds.has(ev.id)}
            onDone={onSpeechDone}
            onCite={onCite}
          />
        ),
      });
    } else {
      rows.push({
        key: `d-${ev.seq}`,
        node: (
          <div className="deliberation">
            <span className="delib-head">
              💭 チーム{ev.team} 内部合議 / {ev.memberName}（{ev.label}）
            </span>
            <details>
              <summary>内容を見る</summary>
              <div className="delib-text">{ev.text}</div>
            </details>
          </div>
        ),
      });
    }
  }

  return (
    <div className="log-view">
      <div className="log-head">
        <h3>発言ログ</h3>
        <label className="delib-toggle">
          <input type="checkbox" checked={showDeliberation} onChange={(e) => setShowDeliberation(e.target.checked)} />
          チーム内合議も表示（観戦者限定・審査員には非公開）
        </label>
      </div>
      {rows.length === 0 && <div className="empty">まだ発言はありません</div>}
      {rows.map((r) => (
        <div key={r.key}>{r.node}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
