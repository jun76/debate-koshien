import { useEffect, useRef, useState } from "react";
import type { AudioEvent, DeliberationEvent, MatchEvent, SpeechEvent, TeamKey } from "@debate/shared";
import { sideLabel } from "@debate/shared";
import { useLang, useT } from "../i18n";

/** Render the speech, turning evidence-reference markers into clickable chips. */
function SpeechText({
  text,
  team,
  resolveCitationTeam,
  onCite,
}: {
  text: string;
  team: TeamKey;
  resolveCitationTeam: (id: string, fallback: TeamKey) => TeamKey;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const citePattern = /([［\[\(（【]?\s*([ANＡＮ])\s*[-ー－–—―]\s*(\d{1,2})\s*[］\]\)）】]?)/gi;
  const parts: { text: string; id?: string }[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(citePattern)) {
    if (m.index === undefined) continue;
    if (m.index > lastIndex) parts.push({ text: text.slice(lastIndex, m.index) });
    const prefix = m[2].toUpperCase() === "Ａ" ? "A" : m[2].toUpperCase() === "Ｎ" ? "N" : m[2].toUpperCase();
    const id = `${prefix}-${m[3].padStart(2, "0")}`;
    parts.push({ text: m[1], id });
    lastIndex = m.index + m[1].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return (
    <span>
      {parts.map((p, i) => {
        if (p.id) {
          return (
            <button key={i} className="cite-chip" onClick={() => onCite(resolveCitationTeam(p.id!, team), p.id!)}>
              {p.id}
            </button>
          );
        }
        return <span key={i}>{p.text}</span>;
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
  resolveCitationTeam,
  onCite,
}: {
  ev: SpeechEvent;
  matchId: string;
  audio?: AudioEvent;
  audioOn: boolean;
  isLatest: boolean;
  finished: boolean;
  onDone: (id: string) => void;
  resolveCitationTeam: (id: string, fallback: TeamKey) => TeamKey;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const chars = [...ev.text];
  const [revealed, setRevealed] = useState(finished || !isLatest ? chars.length : 0);
  const [audioFailed, setAudioFailed] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const revealedRef = useRef(0);
  const animate = isLatest && !finished;
  const wantAudio = animate && audioOn && !audioFailed;
  const useAudio = wantAudio && Boolean(audio);
  const waitingAudio = wantAudio && !audio;
  // While autoplay is blocked, advance the silent typewriter; switch to audio sync once it starts.
  const audioDriving = useAudio && !needsGesture;

  useEffect(() => {
    if (finished || !isLatest) {
      setRevealed(chars.length);
      return;
    }
    setRevealed(0);
    setAudioFailed(false);
    setNeedsGesture(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev.id, finished, isLatest]);

  useEffect(() => {
    revealedRef.current = revealed;
  }, [revealed]);

  // Silent typewriter (audio OFF / failed / autoplay blocked).
  useEffect(() => {
    if (!animate || audioDriving || waitingAudio) return;
    const timer = setInterval(() => {
      setRevealed((r) => {
        if (r >= chars.length) {
          clearInterval(timer);
          return r;
        }
        return r + 2;
      });
    }, 40);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, audioDriving, waitingAudio, ev.id]);

  // Notify that the typewriter finished. Done in an effect because calling the parent's setState
  // inside an updater triggers a React warning. While audio plays, onEnded notifies completion
  // (so the audio is not cut off even if all characters are already revealed).
  useEffect(() => {
    if (!animate || audioDriving) return;
    if (revealed >= chars.length) onDone(ev.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animate, audioDriving, revealed, ev.id]);

  // Audio-wait timeout (fall back to the typewriter if synthesis is slow or fails).
  useEffect(() => {
    if (!waitingAudio) return;
    const t = setTimeout(() => setAudioFailed(true), 45_000);
    return () => clearTimeout(t);
  }, [waitingAudio]);

  // Playback control. Call play() explicitly rather than using the autoplay attribute; if blocked,
  // seek to the typewriter position on the first user gesture (pointerdown) and retry.
  useEffect(() => {
    if (!useAudio) return;
    const el = audioRef.current;
    if (!el) return;
    let cancelled = false;
    const tryPlay = () => {
      if (audio && audio.durationMs > 0 && revealedRef.current > 0) {
        el.currentTime = (revealedRef.current / Math.max(chars.length, 1)) * (audio.durationMs / 1000);
      }
      el.play()
        .then(() => {
          if (!cancelled) setNeedsGesture(false);
        })
        .catch(() => {
          if (!cancelled) setNeedsGesture(true);
        });
    };
    tryPlay();
    const onGesture = () => {
      if (el.paused && !el.ended) tryPlay();
    };
    document.addEventListener("pointerdown", onGesture);
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onGesture);
      el.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useAudio, ev.id]);

  const visible = revealed >= chars.length ? ev.text : chars.slice(0, revealed).join("");
  const speakerSide = sideLabel(ev.side, lang);
  const head =
    ev.kind === "question"
      ? t.log.question((ev.exchangeIndex ?? 0) + 1)
      : ev.kind === "answer"
        ? t.log.answer((ev.exchangeIndex ?? 0) + 1)
        : ev.partLabel;

  return (
    <div className={`speech ${ev.side}`}>
      <div className="speech-head">
        <span className={`side-chip ${ev.side === "affirmative" ? "aff" : "neg"}`}>{speakerSide}</span>
        <span className="speech-part">{head}</span>
        <span className="speech-speaker">{ev.speakerName}</span>
        <span className="speech-chars">{t.log.chars(ev.chars)}</span>
        {audio && !animate && (
          <audio className="speech-audio" src={`/api/matches/${matchId}/audio/${ev.id}`} controls preload="none" />
        )}
      </div>
      {useAudio && (
        <audio
          ref={audioRef}
          src={`/api/matches/${matchId}/audio/${ev.id}`}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            if (el.paused) return;
            if (audio && audio.durationMs > 0) {
              setRevealed(Math.min(chars.length, Math.ceil((el.currentTime * 1000 * chars.length) / audio.durationMs)));
            }
          }}
          onEnded={() => {
            setRevealed(chars.length);
            onDone(ev.id);
          }}
          onError={() => setAudioFailed(true)}
        />
      )}
      <div className="speech-text">
        <SpeechText text={visible} team={ev.team} resolveCitationTeam={resolveCitationTeam} onCite={onCite} />
        {animate && revealed < chars.length && <span className="caret">▌</span>}
      </div>
      {waitingAudio && <div className="audio-wait">{t.log.synthesizing}</div>}
      {needsGesture && <div className="audio-wait">{t.log.autoplayBlocked}</div>}
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
  resolveCitationTeam,
  onCite,
}: {
  matchId: string;
  events: MatchEvent[];
  audioOn: boolean;
  finishedIds: Set<string>;
  onSpeechDone: (id: string) => void;
  resolveCitationTeam: (id: string, fallback: TeamKey) => TeamKey;
  onCite: (team: TeamKey, id: string) => void;
}) {
  const t = useT();
  const [showDeliberation, setShowDeliberation] = useState(true);
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

  // Lay out speeches and (optionally) deliberation logs chronologically, with per-part dividers.
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
            resolveCitationTeam={resolveCitationTeam}
            onCite={onCite}
          />
        ),
      });
    } else {
      rows.push({
        key: `d-${ev.seq}`,
        node: (
          <div className="deliberation">
            <span className="delib-head">{t.log.deliberationHead(ev.team, ev.memberName, ev.label)}</span>
            <details>
              <summary>{t.log.viewContent}</summary>
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
        <h3>{t.log.speechLog}</h3>
        <label className="delib-toggle">
          <input type="checkbox" checked={showDeliberation} onChange={(e) => setShowDeliberation(e.target.checked)} />
          {t.log.showDeliberation}
        </label>
      </div>
      {rows.length === 0 && <div className="empty">{t.log.noSpeeches}</div>}
      {rows.map((r) => (
        <div key={r.key}>{r.node}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
