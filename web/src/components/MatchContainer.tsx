import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarInfo, MatchDetail, MatchEvent, MatchState, SpeechEvent } from "@debate/shared";
import { phaseLabel, sideLabel } from "@debate/shared";
import { abortMatch, fetchAvatars, startMatch, useLiveMatch } from "../api";
import { useLang, useT } from "../i18n";
import { ArenaScreen } from "./ArenaScreen";
import { CutInOverlay, useCutIns } from "./CutIn";
import { ResultScreen } from "./ResultScreen";
import { phaseTone } from "./SetupScreen";

type View = "arena" | "result";

/** Rough time budget (ms) for the whole replay preparation scene (sum of prep events). */
const REPLAY_PREP_BUDGET_MS = 6000;

/**
 * Per-event-type presentation delay (ms) inserted during replay (demo mode).
 * Every event is present from the start, so playing them straight through would look like a
 * fast slideshow. Speeches are paced by the typewriter/audio and phase/vote/result by the
 * cut-in (~1.9s), so we only add a pause for events that would otherwise feel abrupt.
 * prep is budgeted by event count so the preparation scene does not drag on.
 */
function replayPaceOf(ev: MatchEvent, prepPace: number): number {
  switch (ev.type) {
    case "prep":
      return prepPace;
    case "seal":
      return 1000;
    case "hash-check":
      return 500;
    case "deliberation":
      return 900;
    case "speech":
      return 600;
    case "review-ready":
      return 800;
    default:
      return 0;
  }
}

/** Command center of the match screen: live subscription, cut-ins, arena/result switching. */
export function MatchContainer({
  id,
  replay = false,
  onExit,
  onReplay,
}: {
  id: string;
  replay?: boolean;
  onExit: () => void;
  /** Switch a finished match into replay playback (the header replay button). */
  onReplay?: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const live = useLiveMatch(id);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [audioOn, setAudioOn] = useState(true);
  const [finishedIds, setFinishedIds] = useState<Set<string>>(new Set());
  const [displayEvents, setDisplayEvents] = useState<MatchEvent[]>([]);
  const [displayState, setDisplayState] = useState<MatchState | null>(null);
  const [view, setView] = useState<View>("arena");
  const [actionError, setActionError] = useState<string | null>(null);
  // True from the moment the user clicks "abort" until the phase actually settles. Abort takes
  // effect at the next step boundary (after the in-flight generation), so give immediate feedback.
  const [aborting, setAborting] = useState(false);
  const { current: cutin, push } = useCutIns();

  const baseline = useRef<number | null>(null);
  const processed = useRef(0);
  const lastPartId = useRef<string | null>(null);
  const rawEventsRef = useRef<MatchEvent[]>([]);
  const detailRef = useRef<MatchDetail | null>(null);
  const processing = useRef(false);
  const runToken = useRef(0);
  // Ref mirror of finishedIds, so the drain loop can synchronously tell if a speech was already read.
  const finishedIdsRef = useRef<Set<string>>(new Set());
  const speechWaiters = useRef(new Map<string, (() => void)[]>());
  const pendingSpeechId = useRef<string | null>(null);

  useEffect(() => {
    fetchAvatars().then(setAvatars).catch(() => undefined);
  }, []);

  // Clear the abort indicator once the phase actually settles (aborted, or finished/error if the
  // abort did not catch in time). Watch both the event-driven detail and the SSE state so it
  // clears reliably regardless of which update arrives first.
  const settledPhase = live.detail?.state.phase ?? live.state?.phase;
  useEffect(() => {
    if (settledPhase === "aborted" || settledPhase === "finished" || settledPhase === "error") {
      setAborting(false);
    }
  }, [settledPhase]);

  useEffect(() => {
    setFinishedIds(new Set());
    setDisplayEvents([]);
    setDisplayState(null);
    setView("arena");
    setAborting(false);
    baseline.current = null;
    processed.current = 0;
    lastPartId.current = null;
    rawEventsRef.current = [];
    detailRef.current = null;
    processing.current = false;
    runToken.current++;
    speechWaiters.current.forEach((list) => list.forEach((resolve) => resolve()));
    speechWaiters.current.clear();
    finishedIdsRef.current = new Set();
    pendingSpeechId.current = null;
    // Include replay in the deps: the header replay button switches into playback mode for the same match.
  }, [id, replay]);

  const avatarMap = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);
  const detail = live.detail;
  const rawEvents = live.events;
  const events = displayEvents;
  // Replay (demo mode) plays a generated match from the start with presentation. If unfinished, fall back to normal watching.
  const replaying = replay && detail?.state.phase === "finished";

  // When opened partway through, do not fire cut-ins for existing events (take a baseline).
  useEffect(() => {
    if (!detail) return;
    if (baseline.current === null) {
      if (replaying) {
        // Replay: skip nothing; drain the finalized events from the start with presentation.
        baseline.current = 0;
        processed.current = 0;
        rawEventsRef.current = rawEvents;
        detailRef.current = detail;
        setDisplayEvents([]);
        setDisplayState({ phase: "setup", updatedAt: detail.state.updatedAt });
        return;
      }
      baseline.current = rawEvents.length;
      processed.current = rawEvents.length;
      rawEventsRef.current = rawEvents;
      detailRef.current = detail;
      setDisplayEvents(rawEvents);
      setDisplayState(live.state ?? detail.state);
      const speechIds: string[] = [];
      for (const ev of rawEvents) {
        if (ev.type === "speech") {
          speechIds.push(ev.id);
          lastPartId.current = ev.partId;
        }
      }
      // Speeches that already exist when opened are not subject to the typewriter / autoplay
      // (for an in-progress match, only the last one keeps its presentation).
      const skip = detail.state.phase === "debating" ? speechIds.slice(0, -1) : speechIds;
      if (skip.length > 0) {
        for (const sid of skip) finishedIdsRef.current.add(sid);
        setFinishedIds((prev) => new Set([...prev, ...skip]));
      }
      // If the last one is being played, make subsequent events wait for it to finish reading.
      const replayId = speechIds.at(-1);
      if (detail.state.phase === "debating" && replayId && !finishedIdsRef.current.has(replayId)) {
        pendingSpeechId.current = replayId;
      }
      // If a finished match is opened, go straight to the result screen.
      if (detail.state.phase === "finished" || detail.state.phase === "reviewing") setView("result");
      if (detail.state.phase === "preparing" && rawEvents.some((ev) => ev.type === "phase" && ev.phase === "preparing")) {
        void push({ title: t.cutin.prepTitle, sub: t.cutin.prepSub, tone: "neutral" });
      }
    }
  }, [detail, live.state, push, rawEvents]);

  useEffect(() => {
    rawEventsRef.current = rawEvents;
    detailRef.current = detail;
  }, [detail, rawEvents]);

  useEffect(() => {
    if (!detail || baseline.current === null) return;
    const token = runToken.current;
    // Derive the per-prep-event pause from the budget so the whole prep scene fits in ~REPLAY_PREP_BUDGET_MS.
    const prepCount = rawEvents.filter((e) => e.type === "prep").length;
    const prepPace = Math.min(1200, Math.max(400, Math.round(REPLAY_PREP_BUDGET_MS / Math.max(prepCount, 1))));

    // Audio events are not paced. They are recorded a few events after the speech itself, so
    // holding them in the queue would make the reading speech wait for its own audio and time out.
    // Reflect them into displayEvents as they arrive (the drain side skips them naturally via seq dedup).
    const pendingAudio = rawEvents.filter((e) => e.type === "audio");
    if (pendingAudio.length > 0) {
      setDisplayEvents((prev) => {
        const shown = new Set(prev.map((e) => e.seq));
        const missing = pendingAudio.filter((e) => !shown.has(e.seq));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
    const waitForSpeechDone = (sid: string) => {
      // Do not wait on a speech that has already finished reading (next event arrived after the typewriter completed).
      if (finishedIdsRef.current.has(sid)) return Promise.resolve();
      return new Promise<void>((resolve) => {
        const list = speechWaiters.current.get(sid) ?? [];
        list.push(resolve);
        speechWaiters.current.set(sid, list);
      });
    };

    const drain = async () => {
      if (processing.current) return;
      processing.current = true;
      try {
        while (token === runToken.current && processed.current < rawEventsRef.current.length) {
          const ev = rawEventsRef.current[processed.current];
          const currentDetail = detailRef.current;
          if (!currentDetail) break;
          if (pendingSpeechId.current && ev.type !== "audio") {
            await waitForSpeechDone(pendingSpeechId.current);
            pendingSpeechId.current = null;
            if (token !== runToken.current) break;
          }

          if (replaying) {
            const pace = replayPaceOf(ev, prepPace);
            if (pace > 0) {
              await new Promise((r) => setTimeout(r, pace));
              if (token !== runToken.current) break;
            }
          }

          if (ev.type === "speech" && ev.partId !== lastPartId.current) {
            lastPartId.current = ev.partId;
            await push({
              title: ev.partLabel,
              sub: t.cutin.speechSub(sideLabel(ev.side, lang), currentDetail.config.teams[ev.team].name),
              tone: ev.side === "affirmative" ? "aff" : "neg",
            });
          } else if (ev.type === "phase") {
            if (ev.phase === "preparing") await push({ title: t.cutin.prepTitle, sub: t.cutin.prepSub, tone: "neutral" });
            if (ev.phase === "sealed") await push({ title: t.cutin.sealedTitle, sub: t.cutin.sealedSub, tone: "neutral" });
            if (ev.phase === "debating") await push({ title: t.cutin.debatingTitle, tone: "gold" });
            if (ev.phase === "judging") await push({ title: t.cutin.judgingTitle, sub: t.cutin.judgingSub, tone: "neutral" });
          } else if (ev.type === "vote") {
            await push({
              title: t.cutin.voteTitle(ev.judgeName),
              sub: t.cutin.voteSub(sideLabel(ev.vote, lang)),
              tone: ev.vote === "affirmative" ? "aff" : "neg",
            });
          } else if (ev.type === "result") {
            await push({ title: t.cutin.resultTitle, sub: t.cutin.resultSub, tone: "gold" });
          }

          if (token !== runToken.current) break;
          setDisplayEvents((prev) => (prev.some((shown) => shown.seq === ev.seq) ? prev : [...prev, ev]));
          if (ev.type === "phase") {
            setDisplayState({ phase: ev.phase, progress: ev.detail, updatedAt: ev.at });
          }
          processed.current++;
          if (ev.type === "speech") {
            pendingSpeechId.current = ev.id;
          }
          if (ev.type === "result") setView("result");
        }
      } finally {
        processing.current = false;
        if (token === runToken.current && processed.current < rawEventsRef.current.length) {
          void drain();
        }
      }
    };

    void drain();
  }, [detail, push, rawEvents, replaying]);

  if (!detail) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p>{t.common.loadingMatch}</p>
        {live.error && <div className="error-box">{live.error}</div>}
      </div>
    );
  }

  const phase = displayState?.phase ?? live.state?.phase ?? detail.state.phase;
  const canAct = !replaying && !["finished", "aborted"].includes(phase);
  // During replay, keep the result tab locked until the verdict announcement to avoid spoilers.
  const resultAvailable = replaying
    ? events.some((e) => e.type === "result")
    : detail.verdicts.length > 0 || ["judging", "reviewing", "finished"].includes(phase);

  const doStart = async () => {
    setActionError(null);
    try {
      await startMatch(id);
      live.refresh();
    } catch (e) {
      setActionError(String(e instanceof Error ? e.message : e));
    }
  };

  const doAbort = async () => {
    setActionError(null);
    setAborting(true);
    try {
      await abortMatch(id);
      live.refresh();
    } catch (e) {
      setAborting(false);
      setActionError(String(e instanceof Error ? e.message : e));
    }
  };

  // Phase uses the value paced to the cut-in presentation; progress (generating text) always uses the latest SSE value.
  const arenaState: MatchState | null = displayState
    ? { ...displayState, progress: live.state?.progress ?? displayState.progress }
    : live.state;

  const latestSpeech = [...events].reverse().find((e): e is SpeechEvent => e.type === "speech");
  const speaking = latestSpeech ? !finishedIds.has(latestSpeech.id) : false;
  const markSpeechDone = (sid: string) => {
    finishedIdsRef.current.add(sid);
    setFinishedIds((prev) => new Set(prev).add(sid));
    const waiters = speechWaiters.current.get(sid);
    if (waiters) {
      speechWaiters.current.delete(sid);
      for (const resolve of waiters) resolve();
    }
  };

  return (
    <div className="match-shell">
      <header className="arena-header paper">
        <div className="header-left">
          <button className="paper-btn" type="button" onClick={onExit}>
            {t.header.back}
          </button>
          {canAct && (
            <button className="paper-btn danger" type="button" onClick={doAbort} disabled={aborting}>
              {aborting ? t.header.aborting : t.header.abort}
            </button>
          )}
          {aborting ? (
            <span className="phase-pill bad">{t.header.aborting}</span>
          ) : (
            (canAct || replaying || phase === "aborted") && (
              <span className={`phase-pill ${phaseTone(phase)}`}>{phaseLabel(phase, lang)}</span>
            )
          )}
          {replaying && <span className="phase-pill idle">{t.header.demoPlayback}</span>}
          {phase === "error" && (
            <button className="paper-btn" type="button" onClick={doStart}>
              {t.header.retry}
            </button>
          )}
        </div>
        <div className="header-title">
          <span className="header-logo">{t.common.appTitle}</span>
        </div>
        <div className="header-right">
          {detail.state.phase === "finished" && !replay ? (
            // While viewing a finished match there is no audio toggle, so offer replay instead.
            <button className="paper-btn" type="button" onClick={onReplay} disabled={!onReplay} title={t.header.replayTitle}>
              {t.header.replay}
            </button>
          ) : (
            <button
              className={`paper-btn toggle-btn ${audioOn ? "on" : ""}`}
              type="button"
              onClick={() => setAudioOn((v) => !v)}
              title={detail.ttsAvailable ? t.header.audioTitleAvailable : t.header.audioTitleUnavailable}
            >
              {audioOn ? t.header.audioOn : t.header.audioOff}
            </button>
          )}
          <div className="view-tabs">
            <button
              className={`paper-btn tab-btn ${view === "arena" ? "active" : ""}`}
              type="button"
              onClick={() => setView("arena")}
            >
              {t.header.tabArena}
            </button>
            <button
              className={`paper-btn tab-btn gold ${view === "result" ? "active" : ""}`}
              type="button"
              disabled={!resultAvailable}
              onClick={() => setView("result")}
            >
              {t.header.tabResult}
            </button>
          </div>
        </div>
      </header>

      {aborting && <div className="notice-box">{t.header.abortingNote}</div>}
      {(actionError || live.error) && <div className="error-box">{actionError ?? live.error}</div>}
      {phase === "error" && detail.state.error && <div className="error-box">{t.header.errorPrefix}{detail.state.error}</div>}

      {view === "arena" ? (
        <ArenaScreen
          matchId={id}
          detail={detail}
          events={events}
          state={arenaState}
          thinking={live.state?.thinking}
          avatars={avatarMap}
          audioOn={audioOn && detail.ttsAvailable}
          finishedIds={finishedIds}
          onSpeechDone={markSpeechDone}
          replaying={replaying}
        />
      ) : (
        <ResultScreen detail={detail} events={events} avatars={avatarMap} />
      )}

      <CutInOverlay msg={cutin} />
      {/* Slightly energize the whole page while a speaker is reading. */}
      <div className={`arena-vignette ${speaking ? "live" : ""}`} />
    </div>
  );
}
