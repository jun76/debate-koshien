import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type BgmTrack = "lobby" | "arena" | "result";

const TRACK_SRC: Record<BgmTrack, string> = {
  lobby: "/assets/sounds/lobby.mp3",
  arena: "/assets/sounds/arena.mp3",
  result: "/assets/sounds/result.mp3",
};

/** BGM sits under the TTS speech, so the arena track is kept quieter. */
const TRACK_VOLUME: Record<BgmTrack, number> = {
  lobby: 0.35,
  arena: 0.18,
  result: 0.3,
};

const STORAGE_KEY = "debate.audio";

function readStoredAudioOn(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(STORAGE_KEY) !== "off";
}

interface AudioContextValue {
  /** Master audio switch shared by BGM and TTS playback. */
  audioOn: boolean;
  toggleAudio: () => void;
  /** Select the BGM track for the current screen (null stops it). */
  setBgm: (track: BgmTrack | null) => void;
}

const Ctx = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: ReactNode }) {
  const [audioOn, setAudioOn] = useState(readStoredAudioOn);
  const [track, setTrack] = useState<BgmTrack | null>(null);
  const elRef = useRef<HTMLAudioElement | null>(null);

  const toggleAudio = useCallback(() => {
    setAudioOn((v) => {
      try {
        localStorage.setItem(STORAGE_KEY, v ? "off" : "on");
      } catch {
        // Ignore storage failures; the toggle still applies this session.
      }
      return !v;
    });
  }, []);

  const setBgm = useCallback((next: BgmTrack | null) => setTrack(next), []);

  useEffect(() => {
    if (!audioOn || !track) {
      elRef.current?.pause();
      return;
    }
    let el = elRef.current;
    if (!el) {
      el = new Audio();
      el.loop = true;
      elRef.current = el;
    }
    const src = new URL(TRACK_SRC[track], location.origin).href;
    if (el.src !== src) {
      el.src = src;
    }
    el.volume = TRACK_VOLUME[track];
    let cancelled = false;
    const tryPlay = () => {
      el.play().catch(() => {
        // Autoplay may be blocked before the first user gesture; retry on it once.
        if (!cancelled) document.addEventListener("pointerdown", onGesture, { once: true });
      });
    };
    const onGesture = () => {
      if (!cancelled) tryPlay();
    };
    tryPlay();
    return () => {
      cancelled = true;
      document.removeEventListener("pointerdown", onGesture);
    };
  }, [audioOn, track]);

  const value = useMemo<AudioContextValue>(
    () => ({ audioOn, toggleAudio, setBgm }),
    [audioOn, toggleAudio, setBgm],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAudio(): AudioContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudio must be used within an AudioProvider");
  return ctx;
}

/** Play the given BGM track while the calling screen is mounted. */
export function useBgm(track: BgmTrack) {
  const { setBgm } = useAudio();
  useEffect(() => {
    setBgm(track);
  }, [setBgm, track]);
}
