import { useEffect, useState } from "react";
import type { AvatarInfo, FormatDefinition, MemberRole, Provider, TeamKey } from "@debate/shared";
import { ROLE_LABEL } from "@debate/shared";
import { api, fetchAvatars, fetchFormats, fetchProviders, startMatch } from "../api";
import { AvatarRenderer } from "./AvatarRenderer";

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

function newMember(avatarId = ""): MemberForm {
  return { name: "", provider: "mock", model: "", reasoningEffort: "", avatarId, role: "constructive" };
}

function newTeam(key: TeamKey): TeamForm {
  return { name: `チーム${key}`, mode: "council", captainIndex: 0, members: [newMember()] };
}

export function Wizard({ onCreated }: { onCreated: (id: string) => void }) {
  const [formats, setFormats] = useState<FormatDefinition[]>([]);
  const [avatars, setAvatars] = useState<AvatarInfo[]>([]);
  const [providers, setProviders] = useState<{ id: string; label: string }[]>([]);
  const [ttsAvailable, setTtsAvailable] = useState(false);

  const [topic, setTopic] = useState("");
  const [formatId, setFormatId] = useState("quick");
  const [affirmative, setAffirmative] = useState<"A" | "B" | "random">("A");
  const [teams, setTeams] = useState<Record<TeamKey, TeamForm>>({ A: newTeam("A"), B: newTeam("B") });
  const [judgeCount, setJudgeCount] = useState(3);
  const [judges, setJudges] = useState<MemberForm[]>([newMember(), newMember(), newMember()]);
  const [reviewer, setReviewer] = useState<MemberForm>(newMember());
  const [tts, setTts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchFormats().then(setFormats).catch(() => undefined);
    fetchAvatars().then(setAvatars).catch(() => undefined);
    fetchProviders()
      .then((p) => {
        setProviders(p.providers);
        setTtsAvailable(p.ttsAvailable);
        setTts(p.ttsAvailable);
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

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        topic,
        affirmative,
        formatId,
        tts,
        autoAdvance: true,
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
        reviewer: {
          provider: reviewer.provider,
          model: reviewer.model || undefined,
          reasoningEffort: reviewer.reasoningEffort || undefined,
        },
      };
      const res = await api<{ id: string }>("/api/matches", { method: "POST", body: JSON.stringify(payload) });
      await startMatch(res.id);
      onCreated(res.id);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
      setBusy(false);
    }
  };

  const memberEditor = (m: MemberForm, update: (m: MemberForm) => void, opts: { role?: boolean }) => (
    <div className={`member-row ${opts.role ? "with-role" : ""}`}>
      <input
        className="member-name"
        placeholder="名前（省略可）"
        value={m.name}
        onChange={(e) => update({ ...m, name: e.target.value })}
      />
      <select value={m.provider} onChange={(e) => update({ ...m, provider: e.target.value as Provider })}>
        {providers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <input
        className="member-model"
        placeholder="モデル（省略可）"
        value={m.model}
        onChange={(e) => update({ ...m, model: e.target.value })}
      />
      <select
        value={m.reasoningEffort}
        onChange={(e) => update({ ...m, reasoningEffort: e.target.value })}
        title="推論モード"
      >
        {EFFORTS.map((v) => (
          <option key={v} value={v}>
            {v || "推論: 既定"}
          </option>
        ))}
      </select>
      {opts.role && (
        <select value={m.role} onChange={(e) => update({ ...m, role: e.target.value as MemberRole })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
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
    </div>
  );

  const teamEditor = (key: TeamKey) => {
    const t = teams[key];
    return (
      <section className="card" key={key}>
        <h3>
          チーム {key}
          {affirmative === key && <span className="side-chip aff">肯定側</span>}
          {affirmative !== key && affirmative !== "random" && <span className="side-chip neg">否定側</span>}
        </h3>
        <div className="form-line">
          <label>チーム名</label>
          <input value={t.name} onChange={(e) => updateTeam(key, (x) => ({ ...x, name: e.target.value }))} />
          <label>運用方式</label>
          <select
            value={t.mode}
            onChange={(e) => updateTeam(key, (x) => ({ ...x, mode: e.target.value as "council" | "roles" }))}
          >
            <option value="council">合議制 + captain</option>
            <option value="roles">役割分担制</option>
          </select>
        </div>
        {t.members.map((m, i) => (
          <div key={i} className="member-block">
            <div className="member-head">
              <span>メンバー {i + 1}</span>
              {t.mode === "council" && (
                <label className="captain-label">
                  <input
                    type="radio"
                    name={`captain-${key}`}
                    checked={t.captainIndex === i}
                    onChange={() => updateTeam(key, (x) => ({ ...x, captainIndex: i }))}
                  />
                  captain
                </label>
              )}
              {t.members.length > 1 && (
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
                  削除
                </button>
              )}
            </div>
            {memberEditor(m, (nm) => updateTeam(key, (x) => ({ ...x, members: x.members.map((om, j) => (j === i ? nm : om)) })), { role: t.mode === "roles" })}
          </div>
        ))}
        {t.members.length < 5 && (
          <button
            type="button"
            className="mini"
            onClick={() => updateTeam(key, (x) => ({ ...x, members: [...x.members, newMember()] }))}
          >
            + メンバー追加
          </button>
        )}
      </section>
    );
  };

  return (
    <div className="wizard">
      <h2>新しい試合</h2>

      <section className="card">
        <h3>論題</h3>
        <textarea
          rows={2}
          placeholder="例: 日本は中学校・高等学校の部活動を地域クラブに移行すべきである。是か非か"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <div className="form-line">
          <label>フォーマット</label>
          <select value={formatId} onChange={(e) => setFormatId(e.target.value)}>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}（{f.description}）
              </option>
            ))}
          </select>
          <label>肯定側</label>
          <select value={affirmative} onChange={(e) => setAffirmative(e.target.value as "A" | "B" | "random")}>
            <option value="A">チームA</option>
            <option value="B">チームB</option>
            <option value="random">コイントス</option>
          </select>
        </div>
      </section>

      <div className="team-grid">
        {teamEditor("A")}
        {teamEditor("B")}
      </div>

      <section className="card">
        <h3>審査員（奇数）</h3>
        <div className="form-line">
          <label>人数</label>
          <select value={judgeCount} onChange={(e) => setJudgeCountAndResize(Number(e.target.value))}>
            {[1, 3, 5].map((n) => (
              <option key={n} value={n}>
                {n}人
              </option>
            ))}
          </select>
        </div>
        {judges.map((j, i) => (
          <div key={i} className="member-block">
            <div className="member-head">
              <span>審査員 {i + 1}</span>
            </div>
            {memberEditor(j, (nj) => setJudges((prev) => prev.map((oj, k) => (k === i ? nj : oj))), {})}
          </div>
        ))}
      </section>

      <section className="card">
        <h3>感想戦の解説担当</h3>
        {memberEditor(reviewer, setReviewer, {})}
        <div className="form-line">
          <label>
            <input type="checkbox" checked={tts} disabled={!ttsAvailable} onChange={(e) => setTts(e.target.checked)} />
            音声読み上げを生成する{!ttsAvailable && "（piper-plus 未セットアップのため無効）"}
          </label>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      <button className="primary big" disabled={busy || !topic.trim()} onClick={submit}>
        {busy ? "作成中…" : "試合を作成して開始"}
      </button>
    </div>
  );
}
