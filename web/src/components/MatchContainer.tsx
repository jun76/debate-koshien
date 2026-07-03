import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarInfo, MatchDetail, MatchEvent, MatchState, SpeechEvent } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";
import { abortMatch, fetchAvatars, startMatch, useLiveMatch } from "../api";
import { ArenaScreen } from "./ArenaScreen";
import { CutInOverlay, useCutIns } from "./CutIn";
import { ResultScreen } from "./ResultScreen";
import { PHASE_LABEL, phaseTone } from "./SetupScreen";

type View = "arena" | "result";

/** 試合画面の司令塔。ライブ購読・カットイン・アリーナ/結果の切り替えを担う。 */
export function MatchContainer({ id, onExit }: { id: string; onExit: () => void }) {
  const live = useLiveMatch(id);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [audioOn, setAudioOn] = useState(true);
  const [finishedIds, setFinishedIds] = useState<Set<string>>(new Set());
  const [displayEvents, setDisplayEvents] = useState<MatchEvent[]>([]);
  const [displayState, setDisplayState] = useState<MatchState | null>(null);
  const [view, setView] = useState<View>("arena");
  const [actionError, setActionError] = useState<string | null>(null);
  const { current: cutin, push } = useCutIns();

  const baseline = useRef<number | null>(null);
  const processed = useRef(0);
  const lastPartId = useRef<string | null>(null);
  const rawEventsRef = useRef<MatchEvent[]>([]);
  const detailRef = useRef<MatchDetail | null>(null);
  const processing = useRef(false);
  const runToken = useRef(0);

  useEffect(() => {
    fetchAvatars().then(setAvatars).catch(() => undefined);
  }, []);

  useEffect(() => {
    setFinishedIds(new Set());
    setDisplayEvents([]);
    setDisplayState(null);
    setView("arena");
    baseline.current = null;
    processed.current = 0;
    lastPartId.current = null;
    rawEventsRef.current = [];
    detailRef.current = null;
    processing.current = false;
    runToken.current++;
  }, [id]);

  const avatarMap = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);
  const detail = live.detail;
  const rawEvents = live.events;
  const events = displayEvents;

  // 途中から開いたときは既存イベントにカットインを出さない（ベースラインを取る）
  useEffect(() => {
    if (!detail) return;
    if (baseline.current === null) {
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
      // 開いた時点で既に存在する発言はタイプライター・自動再生の対象にしない
      // （進行中の試合では最後の1件だけ演出を続ける）
      const skip = detail.state.phase === "debating" ? speechIds.slice(0, -1) : speechIds;
      if (skip.length > 0) setFinishedIds((prev) => new Set([...prev, ...skip]));
      // 終了済みの試合を開いたら最初から結果画面へ
      if (detail.state.phase === "finished" || detail.state.phase === "reviewing") setView("result");
    }
  }, [detail, live.state, rawEvents]);

  useEffect(() => {
    rawEventsRef.current = rawEvents;
    detailRef.current = detail;
  }, [detail, rawEvents]);

  useEffect(() => {
    if (!detail || baseline.current === null) return;
    const token = runToken.current;

    const drain = async () => {
      if (processing.current) return;
      processing.current = true;
      try {
        while (token === runToken.current && processed.current < rawEventsRef.current.length) {
          const ev = rawEventsRef.current[processed.current];
          const currentDetail = detailRef.current;
          if (!currentDetail) break;

          if (ev.type === "speech" && ev.partId !== lastPartId.current) {
            lastPartId.current = ev.partId;
            await push({
              title: ev.partLabel,
              sub: `${SIDE_LABEL[ev.side]}・${currentDetail.config.teams[ev.team].name}`,
              tone: ev.side === "affirmative" ? "aff" : "neg",
            });
          } else if (ev.type === "phase") {
            if (ev.phase === "preparing") await push({ title: "準備フェーズ開始", sub: "Web調査 解禁", tone: "neutral" });
            if (ev.phase === "sealed") await push({ title: "ハンドアウト封印", sub: "以降の Web 利用は禁止", tone: "neutral" });
            if (ev.phase === "debating") await push({ title: "試合開始！", tone: "gold" });
            if (ev.phase === "judging") await push({ title: "審査開始", sub: "審査員は独立に判定します", tone: "neutral" });
          } else if (ev.type === "vote") {
            await push({
              title: `${ev.judgeName} が投票`,
              sub: `${SIDE_LABEL[ev.vote]}へ`,
              tone: ev.vote === "affirmative" ? "aff" : "neg",
            });
          } else if (ev.type === "result") {
            await push({ title: "判定発表！", sub: `${SIDE_LABEL[ev.winner]}の勝利`, tone: "gold" });
          }

          if (token !== runToken.current) break;
          setDisplayEvents((prev) => (prev.some((shown) => shown.seq === ev.seq) ? prev : [...prev, ev]));
          if (ev.type === "phase") {
            setDisplayState({ phase: ev.phase, progress: ev.detail, updatedAt: ev.at });
          }
          if (ev.type === "result") setView("result");
          processed.current++;
        }
      } finally {
        processing.current = false;
        if (token === runToken.current && processed.current < rawEventsRef.current.length) {
          void drain();
        }
      }
    };

    void drain();
  }, [detail, push, rawEvents]);

  if (!detail) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p>試合を読み込んでいます…</p>
        {live.error && <div className="error-box">{live.error}</div>}
      </div>
    );
  }

  const phase = displayState?.phase ?? live.state?.phase ?? detail.state.phase;
  const canAct = !["finished", "aborted"].includes(phase);
  const resultAvailable =
    detail.verdicts.length > 0 || ["judging", "reviewing", "finished"].includes(phase);

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
    try {
      await abortMatch(id);
      live.refresh();
    } catch (e) {
      setActionError(String(e instanceof Error ? e.message : e));
    }
  };

  const latestSpeech = [...events].reverse().find((e): e is SpeechEvent => e.type === "speech");
  const speaking = latestSpeech ? !finishedIds.has(latestSpeech.id) : false;

  return (
    <div className="match-shell">
      <header className="arena-header paper">
        <div className="header-left">
          <button className="paper-btn" type="button" onClick={onExit}>
            ← 設定
          </button>
          {canAct && (
            <>
              <button className="paper-btn danger" type="button" onClick={doAbort}>
                中断
              </button>
              <span className={`phase-pill ${phaseTone(phase)}`}>{PHASE_LABEL[phase]}</span>
            </>
          )}
          {phase === "error" && (
            <button className="paper-btn" type="button" onClick={doStart}>
              再試行
            </button>
          )}
        </div>
        <div className="header-title">
          <span className="header-logo">AIディベート甲子園</span>
        </div>
        <div className="header-right">
          <button
            className={`paper-btn toggle-btn ${audioOn ? "on" : ""}`}
            type="button"
            onClick={() => setAudioOn((v) => !v)}
            title={detail.ttsAvailable ? "音声読み上げ" : "piper-plus 未セットアップ（表示のみ）"}
          >
            🔊 音声 {audioOn ? "ON" : "OFF"}
          </button>
          <div className="view-tabs">
            <button
              className={`paper-btn tab-btn ${view === "arena" ? "active" : ""}`}
              type="button"
              onClick={() => setView("arena")}
            >
              アリーナ
            </button>
            <button
              className={`paper-btn tab-btn gold ${view === "result" ? "active" : ""}`}
              type="button"
              disabled={!resultAvailable}
              onClick={() => setView("result")}
            >
              結果発表
            </button>
          </div>
        </div>
      </header>

      {(actionError || live.error) && <div className="error-box">{actionError ?? live.error}</div>}
      {phase === "error" && detail.state.error && <div className="error-box">エラー: {detail.state.error}</div>}

      {view === "arena" ? (
        <ArenaScreen
          matchId={id}
          detail={detail}
          events={events}
          state={displayState ?? live.state}
          avatars={avatarMap}
          audioOn={audioOn && detail.ttsAvailable}
          finishedIds={finishedIds}
          onSpeechDone={(sid) => setFinishedIds((prev) => new Set(prev).add(sid))}
        />
      ) : (
        <ResultScreen detail={detail} events={events} avatars={avatarMap} />
      )}

      <CutInOverlay msg={cutin} />
      {/* 話者が読み上げ中はページ全体をわずかに活気づける */}
      <div className={`arena-vignette ${speaking ? "live" : ""}`} />
    </div>
  );
}
