import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarInfo, MatchDetail, MatchEvent, MatchState, SpeechEvent } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";
import { abortMatch, fetchAvatars, startMatch, useLiveMatch } from "../api";
import { ArenaScreen } from "./ArenaScreen";
import { CutInOverlay, useCutIns } from "./CutIn";
import { ResultScreen } from "./ResultScreen";
import { PHASE_LABEL, phaseTone } from "./SetupScreen";

type View = "arena" | "result";

/** リプレイ時の準備シーン全体（prep イベント合計）に割く時間の目安（ms） */
const REPLAY_PREP_BUDGET_MS = 6000;

/**
 * リプレイ（デモモード）時にイベント種別ごとへ挟む演出ディレイ（ms）。
 * 全イベントが最初から揃っているため、素通しにすると高速紙芝居になってしまう。
 * 発言はタイプライター/音声が、phase・vote・result はカットイン（約1.9秒）がペースを作るので、
 * ここでは「間」が無いと不自然になるイベントだけに入れる。
 * prep はイベント数で割った予算制にし、準備シーンが長々と続かないようにする。
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

/** 試合画面の司令塔。ライブ購読・カットイン・アリーナ/結果の切り替えを担う。 */
export function MatchContainer({
  id,
  replay = false,
  onExit,
  onReplay,
}: {
  id: string;
  replay?: boolean;
  onExit: () => void;
  /** 終了済み試合をリプレイ再生に切り替える（ヘッダーのリプレイボタン） */
  onReplay?: () => void;
}) {
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
  // finishedIds の ref ミラー。drain ループが「既に読み終わった発言か」を同期的に判定するために持つ
  const finishedIdsRef = useRef<Set<string>>(new Set());
  const speechWaiters = useRef(new Map<string, (() => void)[]>());
  const pendingSpeechId = useRef<string | null>(null);

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
    speechWaiters.current.forEach((list) => list.forEach((resolve) => resolve()));
    speechWaiters.current.clear();
    finishedIdsRef.current = new Set();
    pendingSpeechId.current = null;
    // replay も依存に含める: ヘッダーのリプレイボタンで同じ試合のまま再生モードへ切り替えるため
  }, [id, replay]);

  const avatarMap = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);
  const detail = live.detail;
  const rawEvents = live.events;
  const events = displayEvents;
  // リプレイ（デモモード）は生成済みの試合を最初から演出付きで流す。未完了の試合なら通常観戦にフォールバック
  const replaying = replay && detail?.state.phase === "finished";

  // 途中から開いたときは既存イベントにカットインを出さない（ベースラインを取る）
  useEffect(() => {
    if (!detail) return;
    if (baseline.current === null) {
      if (replaying) {
        // リプレイ: 何もスキップせず、確定済みイベントを最初から drain で演出付きに流す
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
      // 開いた時点で既に存在する発言はタイプライター・自動再生の対象にしない
      // （進行中の試合では最後の1件だけ演出を続ける）
      const skip = detail.state.phase === "debating" ? speechIds.slice(0, -1) : speechIds;
      if (skip.length > 0) {
        for (const sid of skip) finishedIdsRef.current.add(sid);
        setFinishedIds((prev) => new Set([...prev, ...skip]));
      }
      // 最後の1件を再生する場合は、後続イベントがその読み終わりを待つようにする
      const replayId = speechIds.at(-1);
      if (detail.state.phase === "debating" && replayId && !finishedIdsRef.current.has(replayId)) {
        pendingSpeechId.current = replayId;
      }
      // 終了済みの試合を開いたら最初から結果画面へ
      if (detail.state.phase === "finished" || detail.state.phase === "reviewing") setView("result");
      if (detail.state.phase === "preparing" && rawEvents.some((ev) => ev.type === "phase" && ev.phase === "preparing")) {
        void push({ title: "準備フェーズ開始", sub: "Web調査 解禁", tone: "neutral" });
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
    // 準備シーンは合計 REPLAY_PREP_BUDGET_MS 程度に収まるよう、prep 1件あたりの間を予算から割り出す
    const prepCount = rawEvents.filter((e) => e.type === "prep").length;
    const prepPace = Math.min(1200, Math.max(400, Math.round(REPLAY_PREP_BUDGET_MS / Math.max(prepCount, 1))));

    // audio イベントはペーシングの対象外。発言本体より数イベント後に記録されるため、
    // キューで堰き止めると読み上げ中の発言が自分の音声を待ってタイムアウトしてしまう。
    // 到着し次第 displayEvents へ反映する（drain 側は seq 重複で自然にスキップされる）。
    const pendingAudio = rawEvents.filter((e) => e.type === "audio");
    if (pendingAudio.length > 0) {
      setDisplayEvents((prev) => {
        const shown = new Set(prev.map((e) => e.seq));
        const missing = pendingAudio.filter((e) => !shown.has(e.seq));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
    const waitForSpeechDone = (sid: string) => {
      // 既に読み終わっている発言は待たない（タイプライター完了後に次イベントが届いた場合）
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
            await push({ title: "判定発表！", sub: "結果発表へ", tone: "gold" });
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
        <p>試合を読み込んでいます…</p>
        {live.error && <div className="error-box">{live.error}</div>}
      </div>
    );
  }

  const phase = displayState?.phase ?? live.state?.phase ?? detail.state.phase;
  const canAct = !replaying && !["finished", "aborted"].includes(phase);
  // リプレイ中は「判定発表」まで結果タブを開けないようにしてネタバレを防ぐ
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
    try {
      await abortMatch(id);
      live.refresh();
    } catch (e) {
      setActionError(String(e instanceof Error ? e.message : e));
    }
  };

  // フェーズはカットイン演出に合わせてペーシングした値、progress（生成中テキスト）は常に最新の SSE 値を使う
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
            ← 設定
          </button>
          {canAct && (
            <button className="paper-btn danger" type="button" onClick={doAbort}>
              中断
            </button>
          )}
          {(canAct || replaying) && (
            <span className={`phase-pill ${phaseTone(phase)}`}>{PHASE_LABEL[phase]}</span>
          )}
          {replaying && <span className="phase-pill idle">デモ再生</span>}
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
          {detail.state.phase === "finished" && !replay ? (
            // 終了済み試合の閲覧中は音声トグルの出番がないので、代わりにリプレイ再生を出す
            <button className="paper-btn" type="button" onClick={onReplay} disabled={!onReplay} title="この試合を最初から演出付きで再生">
              ⟲ リプレイ再生
            </button>
          ) : (
            <button
              className={`paper-btn toggle-btn ${audioOn ? "on" : ""}`}
              type="button"
              onClick={() => setAudioOn((v) => !v)}
              title={detail.ttsAvailable ? "音声読み上げ" : "piper-plus 未セットアップ（表示のみ）"}
            >
              🔊 音声 {audioOn ? "ON" : "OFF"}
            </button>
          )}
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
      {/* 話者が読み上げ中はページ全体をわずかに活気づける */}
      <div className={`arena-vignette ${speaking ? "live" : ""}`} />
    </div>
  );
}
