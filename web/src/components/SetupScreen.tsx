import { useState } from "react";
import type { MatchSummary, Phase } from "@debate/shared";
import { phaseLabel } from "@debate/shared";
import { Art } from "../art/Art";
import { FbGavel, FbTrophy } from "../art/fallbacks";
import { LanguageToggle, useLang, useT } from "../i18n";
import { Wizard } from "./Wizard";

export function phaseTone(phase: Phase): string {
  if (phase === "finished") return "done";
  if (phase === "aborted" || phase === "error") return "bad";
  if (phase === "setup" || phase === "sealed") return "idle";
  return "live";
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Setup screen (lobby): the team-building wizard plus a ticket list of past matches. */
export function SetupScreen({
  matches,
  onOpen,
  onDeleted,
  onCreated,
  loadError,
}: {
  matches: MatchSummary[];
  onOpen: (id: string, opts?: { replay?: boolean }) => void;
  onDeleted: (id: string) => Promise<void>;
  onCreated: (id: string, opts?: { replay?: boolean }) => void;
  loadError: string | null;
}) {
  const t = useT();
  const { lang } = useLang();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const doDelete = async (match: MatchSummary) => {
    if (!confirm(t.lobby.deleteConfirm(match.topic))) return;
    setDeletingId(match.id);
    try {
      await onDeleted(match.id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="setup-screen">
      <div className="lobby-topbar">
        <LanguageToggle />
      </div>
      <div className="lobby-title wobble-soft">
        <div className="lobby-deco left">
          <Art name="gavel" className="deco-art" fallback={<FbGavel />} />
        </div>
        <div>
          <div className="lobby-kicker">{t.lobby.kicker}</div>
          <h1>{t.common.appTitle}</h1>
          <div className="lobby-sub">{t.lobby.subtitle}</div>
        </div>
        <div className="lobby-deco right">
          <Art name="trophy" className="deco-art" fallback={<FbTrophy />} />
        </div>
      </div>

      {loadError && <div className="error-box">{loadError}</div>}

      <div className="lobby-layout">
        <aside className="ticket-rail">
          <div className="rail-title">{t.lobby.pastMatches}</div>
          {matches.length === 0 && <div className="empty">{t.lobby.noMatches}</div>}
          {matches.map((m, i) => (
            <div
              key={m.id}
              className="ticket pop-in"
              style={{ animationDelay: `${Math.min(i * 60, 400)}ms` }}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(m.id)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" && e.key !== " ") return;
                e.preventDefault();
                onOpen(m.id);
              }}
            >
              <button
                type="button"
                className="ticket-delete"
                aria-label={t.lobby.deleteMatch}
                title={t.lobby.deleteMatch}
                onClick={(e) => {
                  e.stopPropagation();
                  void doDelete(m);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  void doDelete(m);
                }}
              >
                {deletingId === m.id ? "…" : <TrashIcon />}
              </button>
              {m.phase === "finished" && (
                <button
                  type="button"
                  className="ticket-replay"
                  aria-label={t.lobby.replayTitle}
                  title={t.lobby.replayTitle}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(m.id, { replay: true });
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    e.stopPropagation();
                    onOpen(m.id, { replay: true });
                  }}
                >
                  <ReplayIcon />
                </button>
              )}
              <span className={`phase-pill ${phaseTone(m.phase)}`}>{phaseLabel(m.phase, lang)}</span>
              <span className="ticket-topic">{m.topic}</span>
              <span className="ticket-date">{new Date(m.createdAt).toLocaleString(t.common.localeString)}</span>
            </div>
          ))}
        </aside>

        <div className="lobby-main">
          <Wizard onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
