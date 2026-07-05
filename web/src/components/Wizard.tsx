import { useEffect, useRef, useState } from "react";
import type { AvatarInfo, FormatDefinition, Lang, MemberRole, Provider, TeamKey } from "@debate-koshien/shared";
import { formatDescription, formatName, roleLabel, sideLabel } from "@debate-koshien/shared";
import { api, fetchAvatars, fetchFormats, fetchMatch, fetchProviders, startMatch } from "../api";
import { useLang, useT } from "../i18n";
import { AvatarRenderer } from "./AvatarRenderer";
import { ConfirmDialog } from "./ConfirmDialog";

interface MemberForm {
  name: string;
  provider: Provider;
  model: string;
  reasoningEffort: string;
  avatarId: string;
  role: MemberRole;
}

interface TeamForm {
  name: string;
  mode: "council" | "roles";
  captainIndex: number;
  members: MemberForm[];
}

const EFFORTS = ["", "low", "medium", "high"];
const ROLES: MemberRole[] = ["researcher", "constructive", "questioner", "rebuttal", "strategist"];
const PROVIDERS: Provider[] = ["mock", "claude", "codex", "opencode"];

function newMember(avatarId = ""): MemberForm {
  return { name: "", provider: "mock", model: "", reasoningEffort: "", avatarId, role: "constructive" };
}

function newTeam(): TeamForm {
  // Leave the name empty; the server fills the localized default when it is blank. This keeps the
  // default correct regardless of the language selected at match-creation time.
  return { name: "", mode: "council", captainIndex: 0, members: [newMember()] };
}

/* ---------- Settings JSON import / export ---------- */

interface WizardConfigFile {
  version: number;
  topic: string;
  formatId: string;
  affirmative: "A" | "B" | "random";
  teams: Record<TeamKey, TeamForm>;
  judges: MemberForm[];
  tts: boolean;
  exhibition: boolean;
}

function sanitizeMember(raw: unknown): MemberForm {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    name: typeof r.name === "string" ? r.name : "",
    provider: PROVIDERS.includes(r.provider as Provider) ? (r.provider as Provider) : "mock",
    model: typeof r.model === "string" ? r.model : "",
    reasoningEffort: typeof r.reasoningEffort === "string" ? r.reasoningEffort : "",
    avatarId: typeof r.avatarId === "string" ? r.avatarId : "",
    role: ROLES.includes(r.role as MemberRole) ? (r.role as MemberRole) : "constructive",
  };
}

function sanitizeTeam(raw: unknown): TeamForm {
  const r = (raw ?? {}) as Record<string, unknown>;
  const members =
    Array.isArray(r.members) && r.members.length > 0
      ? r.members.slice(0, 5).map(sanitizeMember)
      : [newMember()];
  const captainIndex = Number.isInteger(r.captainIndex) ? (r.captainIndex as number) : 0;
  return {
    name: typeof r.name === "string" ? r.name : "",
    mode: r.mode === "roles" ? "roles" : "council",
    captainIndex: Math.min(Math.max(captainIndex, 0), members.length - 1),
    members,
  };
}

export function Wizard({
  onCreated,
  onMatchesChanged,
}: {
  onCreated: (id: string, opts?: { replay?: boolean }) => void;
  onMatchesChanged?: () => void;
}) {
  const t = useT();
  const { lang } = useLang();
  const [formats, setFormats] = useState<FormatDefinition[]>([]);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [ttsMap, setTtsMap] = useState<Record<Lang, boolean>>({ ja: false, en: false });
  const ttsAvailable = ttsMap[lang];

  const [topic, setTopic] = useState("");
  const [formatId, setFormatId] = useState("quick");
  const [affirmative, setAffirmative] = useState<"A" | "B" | "random">("A");
  const [teams, setTeams] = useState<Record<TeamKey, TeamForm>>(() => ({ A: newTeam(), B: newTeam() }));
  const [judgeCount, setJudgeCount] = useState(1);
  const [judges, setJudges] = useState<MemberForm[]>([newMember()]);
  const [tts, setTts] = useState(true);
  const [exhibition, setExhibition] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** 全員 Mock で開始しようとしたときの確認モーダル */
  const [mockConfirmOpen, setMockConfirmOpen] = useState(false);
  /** Progress text shown while an exhibition match is being pre-generated (null when not generating). */
  const [exhibitionProgress, setExhibitionProgress] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchFormats().then(setFormats).catch(() => undefined);
    fetchAvatars().then(setAvatars).catch(() => undefined);
    fetchProviders()
      .then((p) => {
        setProviders(p.providers.map((x) => x.id));
        setTtsMap(p.tts);
      })
      .catch(() => undefined);
  }, []);

  const updateTeam = (key: TeamKey, fn: (t: TeamForm) => TeamForm) => {
    setTeams((prev) => ({ ...prev, [key]: fn(prev[key]) }));
  };

  const setJudgeCountAndResize = (n: number) => {
    setJudgeCount(n);
    setJudges((prev) => {
      const next = [...prev];
      while (next.length < n) next.push(newMember());
      return next.slice(0, n);
    });
  };

  /** Download the whole current input set as a JSON file. */
  const exportConfig = () => {
    const data: WizardConfigFile = {
      version: 1,
      topic,
      formatId,
      affirmative,
      teams,
      judges,
      tts,
      exhibition,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "debate-setup.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  /** Restore the whole input set from a JSON file (missing fields fall back to defaults). */
  const importConfig = async (file: File) => {
    setError(null);
    try {
      const raw = JSON.parse(await file.text()) as Record<string, unknown>;
      if (typeof raw !== "object" || raw === null) throw new Error(t.wizard.notJsonObject);

      if (typeof raw.topic === "string") setTopic(raw.topic);
      if (typeof raw.formatId === "string" && (formats.length === 0 || formats.some((f) => f.id === raw.formatId))) {
        setFormatId(raw.formatId);
      }
      if (raw.affirmative === "A" || raw.affirmative === "B" || raw.affirmative === "random") {
        setAffirmative(raw.affirmative);
      }
      const teamsRaw = (raw.teams ?? {}) as Record<string, unknown>;
      setTeams({ A: sanitizeTeam(teamsRaw.A), B: sanitizeTeam(teamsRaw.B) });

      let importedJudges = Array.isArray(raw.judges) && raw.judges.length > 0 ? raw.judges.slice(0, 5).map(sanitizeMember) : [newMember()];
      if (importedJudges.length % 2 === 0) importedJudges = importedJudges.slice(0, -1);
      setJudges(importedJudges);
      setJudgeCount(importedJudges.length);

      if (typeof raw.tts === "boolean") setTts(raw.tts && ttsAvailable);
      // 旧形式（demo）の設定ファイルも受け付ける
      const ex = typeof raw.exhibition === "boolean" ? raw.exhibition : typeof raw.demo === "boolean" ? raw.demo : undefined;
      if (ex !== undefined) setExhibition(ex);
    } catch (e) {
      setError(t.wizard.configFileError(e instanceof Error ? e.message : String(e)));
    }
  };

  /** Exhibition mode: wait until the server finishes all inference + audio (i.e. reaches "finished"). */
  const waitForExhibitionReady = async (id: string) => {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      const d = await fetchMatch(id);
      const phase = d.state.phase;
      if (phase === "finished") return;
      if (phase === "aborted" || phase === "error") {
        throw new Error(d.state.error ?? t.wizard.exhibitionInterrupted);
      }
      setExhibitionProgress(d.state.progress?.trim() || t.wizard.generatingMatch);
    }
  };

  /** 全エージェント（メンバー + 審査員）が Mock かどうか */
  const allMock =
    [...teams.A.members, ...teams.B.members, ...judges].every((m) => m.provider === "mock");

  /** 開始ボタン。全員 Mock のときは一度確認モーダルを挟む */
  const requestSubmit = () => {
    if (allMock) {
      setMockConfirmOpen(true);
      return;
    }
    void submit();
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        topic,
        affirmative,
        formatId,
        lang,
        tts,
        autoAdvance: true,
        exhibition,
        teams: Object.fromEntries(
          (Object.entries(teams) as [TeamKey, TeamForm][]).map(([key, t]) => [
            key,
            {
              name: t.name,
              mode: t.mode,
              captainIndex: t.captainIndex,
              members: t.members.map((m) => ({
                name: m.name || undefined,
                provider: m.provider,
                model: m.model || undefined,
                reasoningEffort: m.reasoningEffort || undefined,
                avatarId: m.avatarId || undefined,
              })),
              roles:
                t.mode === "roles"
                  ? Object.fromEntries(t.members.map((m, i) => [String(i), m.role]))
                  : undefined,
            },
          ]),
        ),
        judges: judges.map((j) => ({
          name: j.name || undefined,
          provider: j.provider,
          model: j.model || undefined,
          reasoningEffort: j.reasoningEffort || undefined,
          avatarId: j.avatarId || undefined,
        })),
      };
      const res = await api<{ id: string }>("/api/matches", { method: "POST", body: JSON.stringify(payload) });
      onMatchesChanged?.();
      await startMatch(res.id);
      if (exhibition) {
        setExhibitionProgress(t.wizard.generatingMatch);
        await waitForExhibitionReady(res.id);
        onCreated(res.id, { replay: true });
      } else {
        onCreated(res.id);
      }
    } catch (e) {
      onMatchesChanged?.();
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
      setExhibitionProgress(null);
    }
  };

  // 普段の操作で必要なのはプロバイダとアバターだけ。名前・モデル・推論は折りたたみに隠す
  const memberEditor = (m: MemberForm, update: (m: MemberForm) => void, opts: { role?: boolean }) => (
    <div className={`member-row ${opts.role ? "with-role" : ""}`}>
      <select value={m.provider} onChange={(e) => update({ ...m, provider: e.target.value as Provider })}>
        {providers.map((p) => (
          <option key={p} value={p}>
            {t.common.providerLabels[p]}
          </option>
        ))}
      </select>
      {opts.role && (
        <select value={m.role} onChange={(e) => update({ ...m, role: e.target.value as MemberRole })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, lang)}
            </option>
          ))}
        </select>
      )}
      <div className="avatar-picker">
        {avatars.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`avatar-choice ${m.avatarId === a.id ? "selected" : ""}`}
            onClick={() => update({ ...m, avatarId: m.avatarId === a.id ? "" : a.id })}
            title={a.id}
          >
            <AvatarRenderer avatar={a} speaking={false} size={36} maxHeight={36} />
          </button>
        ))}
      </div>
      <details className="member-advanced">
        <summary>{t.wizard.advanced}</summary>
        <div className="advanced-fields">
          <input
            className="member-name"
            placeholder={t.wizard.namePlaceholder}
            value={m.name}
            onChange={(e) => update({ ...m, name: e.target.value })}
          />
          <input
            className="member-model"
            placeholder={t.wizard.modelPlaceholder}
            value={m.model}
            onChange={(e) => update({ ...m, model: e.target.value })}
          />
          <select
            value={m.reasoningEffort}
            onChange={(e) => update({ ...m, reasoningEffort: e.target.value })}
            title={t.wizard.reasoningTitle}
          >
            {EFFORTS.map((v) => (
              <option key={v} value={v}>
                {v || t.wizard.reasoningDefault}
              </option>
            ))}
          </select>
        </div>
      </details>
    </div>
  );

  const teamEditor = (key: TeamKey) => {
    const team = teams[key];
    return (
      <section className="card" key={key}>
        <h3 className="team-heading">
          <span>{t.wizard.teamHeading(key)}</span>
          {affirmative === key && <span className="side-chip aff">{sideLabel("affirmative", lang)}</span>}
          {affirmative !== key && affirmative !== "random" && (
            <span className="side-chip neg">{sideLabel("negative", lang)}</span>
          )}
        </h3>
        <div className="form-line">
          <label>{t.wizard.teamName}</label>
          <input
            placeholder={key === "A" ? t.wizard.teamAOption : t.wizard.teamBOption}
            value={team.name}
            onChange={(e) => updateTeam(key, (x) => ({ ...x, name: e.target.value }))}
          />

          <label>{t.wizard.teamMode}</label>
          <select
            value={team.mode}
            onChange={(e) => updateTeam(key, (x) => ({ ...x, mode: e.target.value as "council" | "roles" }))}
          >
            <option value="council">{t.wizard.councilOption}</option>
            <option value="roles">{t.wizard.rolesOption}</option>
          </select>
        </div>
        {team.members.map((m, i) => (
          <div key={i} className="member-block">
            <div className="member-head">
              <span>{t.wizard.member(i + 1)}</span>
              {team.mode === "council" && (
                <label className="captain-label">
                  <input
                    type="radio"
                    name={`captain-${key}`}
                    checked={team.captainIndex === i}
                    onChange={() => updateTeam(key, (x) => ({ ...x, captainIndex: i }))}
                  />
                  captain
                </label>
              )}
              {team.members.length > 1 && (
                <button
                  type="button"
                  className="mini"
                  onClick={() =>
                    updateTeam(key, (x) => ({
                      ...x,
                      members: x.members.filter((_, j) => j !== i),
                      captainIndex: 0,
                    }))
                  }
                >
                  {t.wizard.removeMember}
                </button>
              )}
            </div>
            {memberEditor(m, (nm) => updateTeam(key, (x) => ({ ...x, members: x.members.map((om, j) => (j === i ? nm : om)) })), { role: team.mode === "roles" })}
          </div>
        ))}
        {team.members.length < 5 && (
          <button
            type="button"
            className="mini"
            onClick={() => updateTeam(key, (x) => ({ ...x, members: [...x.members, newMember()] }))}
          >
            {t.wizard.addMember}
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="wizard">
      <div className="wizard-head">
        <h2>{t.wizard.newMatch}</h2>
        <div className="wizard-io">
          <button type="button" className="mini" onClick={exportConfig}>
            {t.wizard.exportConfig}
          </button>
          <button type="button" className="mini" onClick={() => importInputRef.current?.click()}>
            {t.wizard.importConfig}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importConfig(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <section className="card">
        <h3>{t.wizard.resolutionHeading}</h3>
        <textarea
          rows={2}
          placeholder={t.wizard.resolutionPlaceholder}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="form-line">
          <label>{t.wizard.format}</label>
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {formatName(f.id, lang)}（{formatDescription(f.id, lang)}）
              </option>
            ))}
          </select>
          <label>{t.wizard.affirmativeSelect}</label>
          <select value={affirmative} onChange={(e) => setAffirmative(e.target.value as "A" | "B" | "random")}>
            <option value="A">{t.wizard.teamAOption}</option>
            <option value="B">{t.wizard.teamBOption}</option>
            <option value="random">{t.wizard.coinToss}</option>
          </select>
        </div>
      </section>

      <div className="team-grid">
        {teamEditor("A")}
        {teamEditor("B")}
      </div>

      <section className="card">
        <h3>{t.wizard.judgesHeading}</h3>
        <div className="judges-note">{t.wizard.reviewerNote}</div>
        <div className="form-line">
          <label>{t.wizard.count}</label>
          <select value={judgeCount} onChange={(e) => setJudgeCountAndResize(Number(e.target.value))}>
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {t.wizard.people(n)}
              </option>
            ))}
          </select>
        </div>
        {judges.map((j, i) => (
          <div key={i} className="member-block">
            <div className="member-head">
              <span>{t.wizard.judge(i + 1)}</span>
            </div>
            {memberEditor(j, (nj) => setJudges((prev) => prev.map((oj, k) => (k === i ? nj : oj))), {})}
          </div>
        ))}
      </section>

      <section className="card">
        <h3>{t.wizard.spectatorOptions}</h3>
        <div className="form-line">
          <label title={t.wizard.ttsTitle}>
            <input type="checkbox" checked={tts && ttsAvailable} disabled={!ttsAvailable} onChange={(e) => setTts(e.target.checked)} />
            {t.wizard.ttsLabel}
            {!ttsAvailable && t.wizard.ttsDisabled}
          </label>
        </div>
        <div className="form-line">
          <label title={t.wizard.exhibitionTitle}>
            <input type="checkbox" checked={exhibition} disabled={busy} onChange={(e) => setExhibition(e.target.checked)} />
            {t.wizard.exhibitionLabel}
          </label>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      <button className="primary big" disabled={busy || !topic.trim()} onClick={requestSubmit}>
        {busy && <span className="btn-spinner" aria-hidden="true" />}
        {exhibitionProgress !== null
          ? t.wizard.exhibitionGenerating(exhibitionProgress)
          : busy
            ? t.wizard.creating
            : exhibition
              ? t.wizard.exhibitionCreateStart
              : t.wizard.createStart}
      </button>
      {exhibitionProgress !== null && <div className="demo-note">{t.wizard.exhibitionNote}</div>}

      <ConfirmDialog
        open={mockConfirmOpen}
        title={t.wizard.mockConfirmTitle}
        message={t.wizard.mockConfirmMessage}
        confirmLabel={t.wizard.mockConfirmProceed}
        cancelLabel={t.common.cancel}
        onConfirm={() => {
          setMockConfirmOpen(false);
          void submit();
        }}
        onCancel={() => setMockConfirmOpen(false)}
      />
    </div>
  );
}
