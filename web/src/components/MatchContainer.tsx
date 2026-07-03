import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarInfo, SpeechEvent } from "@debate/shared";
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
  const [view, setView] = useState<View>("arena");
  const [actionError, setActionError] = useState<string | null>(null);
  const { current: cutin, push } = useCutIns();

  const baseline = useRef<number | null>(null);
  const processed = useRef(0);
  const lastPartId = useRef<string | null>(null);

  useEffect(() => {
    fetchAvatars().then(setAvatars).catch(() => undefined);
  }, []);

  useEffect(() => {
    setFinishedIds(new Set());
    setView("arena");
    baseline.current = null;
    processed.current = 0;
    lastPartId.current = null;
  }, [id]);

  const avatarMap = useMemo(() => new Map(avatars.map((a) => [a.id, a])), [avatars]);
  const detail = live.detail;
  const events = live.events;

  // 途中から開いたときは既存イベントにカットインを出さない（ベースラインを取る）
  useEffect(() => {
    if (!detail) return;
    if (baseline.current === null) {
      baseline.current = events.length;
      processed.current = events.length;
      const speechIds: string[] = [];
      for (const ev of events) {
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
      return;
    }
    for (let i = processed.current; i < events.length; i++) {
      const ev = events[i];
      if (ev.type === "speech" && ev.partId !== lastPartId.current) {
        lastPartId.current = ev.partId;
        push({
          title: ev.partLabel,
          sub: `${SIDE_LABEL[ev.side]}・${detail.config.teams[ev.team].name}`,
          tone: ev.side === "affirmative" ? "aff" : "neg",
        });
      } else if (ev.type === "phase") {
        if (ev.phase === "preparing") push({ title: "準備フェーズ開始", sub: "Web調査 解禁", tone: "neutral" });
        if (ev.phase === "sealed") push({ title: "ハンドアウト封印", sub: "以降の Web 利用は禁止", tone: "neutral" });
        if (ev.phase === "debating") push({ title: "試合開始！", tone: "gold" });
        if (ev.phase === "judging") push({ title: "審査開始", sub: "審査員は独立に判定します", tone: "neutral" });
      } else if (ev.type === "vote") {
        push({
          title: `${ev.judgeName} が投票`,
          sub: `${SIDE_LABEL[ev.vote]}へ`,
          tone: ev.vote === "affirmative" ? "aff" : "neg",
        });
      } else if (ev.type === "result") {
        push({ title: "判定発表！", sub: `${SIDE_LABEL[ev.winner]}の勝利`, tone: "gold" });
        setTimeout(() => setView("result"), 2300);
      }
    }
    processed.current = events.length;
  }, [detail, events, push]);

  if (!detail) {
    return (
      <div className="center-state">
        <div className="spinner" />
        <p>試合を読み込んでいます…</p>
        {live.error && <div className="error-box">{live.error}</div>}
      </div>
    );
  }

  const phase = live.state?.phase ?? detail.state.phase;
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
          state={live.state}
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
