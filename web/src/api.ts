import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AvatarInfo,
  FormatDefinition,
  HandoutResponse,
  Lang,
  MatchDetail,
  MatchEvent,
  MatchState,
  MatchSummary,
  Provider,
  TeamKey,
} from "@debate-koshien/shared";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
    throw new Error(body.errors?.join(" / ") ?? body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const fetchFormats = () => api<FormatDefinition[]>("/api/formats");
export const fetchAvatars = () => api<AvatarInfo[]>("/api/avatars");
export const fetchProviders = () =>
  api<{ providers: { id: Provider }[]; tts: Record<Lang, boolean> }>("/api/providers");
export const fetchMatches = () => api<MatchSummary[]>("/api/matches");
export const fetchMatch = (id: string) => api<MatchDetail>(`/api/matches/${id}`);
export const fetchHandout = (id: string, team: TeamKey) =>
  api<HandoutResponse>(`/api/matches/${id}/handouts/${team}`);
export const startMatch = (id: string) =>
  api<{ ok: boolean }>(`/api/matches/${id}/phase`, { method: "POST", body: JSON.stringify({ action: "start" }) });
export const abortMatch = (id: string) => api<{ ok: boolean }>(`/api/matches/${id}/abort`, { method: "POST" });
export const deleteMatch = (id: string) => api<{ ok: boolean }>(`/api/matches/${id}`, { method: "DELETE" });

export interface LiveMatch {
  detail: MatchDetail | null;
  events: MatchEvent[];
  state: MatchState | null;
  error: string | null;
  refresh: () => void;
}

/** Match detail plus live updates over SSE. */
export function useLiveMatch(id: string): LiveMatch {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [state, setState] = useState<MatchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seenSeq = useRef(-1);

  const refresh = useCallback(() => {
    fetchMatch(id)
      .then((d) => {
        setDetail(d);
        setState(d.state);
        setEvents((prev) => {
          // SSE may already be ahead, so keep whichever has the further-along last seq.
          const prevLast = prev[prev.length - 1]?.seq ?? -1;
          const nextLast = d.events[d.events.length - 1]?.seq ?? -1;
          return nextLast >= prevLast ? d.events : prev;
        });
        seenSeq.current = Math.max(seenSeq.current, d.events[d.events.length - 1]?.seq ?? -1);
      })
      .catch((e) => setError(String(e)));
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const es = new EventSource(`/api/matches/${id}/events?from=0`);
    es.addEventListener("match", (raw) => {
      const ev = JSON.parse((raw as MessageEvent).data) as MatchEvent;
      if (ev.seq <= seenSeq.current) return;
      seenSeq.current = ev.seq;
      setEvents((prev) => [...prev, ev]);
      // Refetch detail (verdicts / review / seals) on judging / sealing / finishing events.
      if (["seal", "vote", "result", "review-ready", "phase"].includes(ev.type)) {
        refresh();
      }
    });
    es.addEventListener("state", (raw) => {
      setState(JSON.parse((raw as MessageEvent).data) as MatchState);
    });
    es.onerror = () => {
      // Leave it to the automatic reconnection.
    };
    return () => es.close();
  }, [id, refresh]);

  return { detail, events, state, error, refresh };
}
