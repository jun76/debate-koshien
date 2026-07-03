import type { AgentConfig, AvatarInfo, MatchConfig, Side, TeamKey, ThinkingInfo } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";
import { Art } from "../art/Art";
import {
  FbAudience,
  FbAvatar,
  FbBackdrop,
  FbBunting,
  FbCurtain,
  FbMic,
  FbNameplate,
  FbPodium,
  FbSpeechSign,
  FbTopicBoard,
  FbTree,
  FbVsMedallion,
} from "../art/fallbacks";
import { AvatarRenderer } from "./AvatarRenderer";

/**
 * ペーパークラフト調の観戦ステージ。
 * 肯定側を左（緑）、否定側を右（赤）に配置し、現在の話者だけが口パクする。
 * 背景・幕・演台などは assets/ui/ の画像を優先し、無ければ SVG フォールバックを使う。
 */
export function Stage({
  config,
  avatars,
  speakingSpeakerId,
  speakingTeam,
  topic,
  signTexts,
  thinking,
}: {
  config: MatchConfig;
  avatars: Map<string, AvatarInfo>;
  speakingSpeakerId: string | null;
  speakingTeam: TeamKey | null;
  topic: string;
  signTexts: Record<TeamKey, string | null>;
  thinking?: Record<string, ThinkingInfo>;
}) {
  const left: TeamKey = config.affirmative;
  const right: TeamKey = left === "A" ? "B" : "A";

  // チームごとの思考中ラベル（セリフバルーンに「思考中…」を出すため）
  const teamThinking: Record<TeamKey, string | null> = { A: null, B: null };
  for (const info of Object.values(thinking ?? {})) {
    if (info.scope === "team" && info.team) teamThinking[info.team] = info.label;
  }

  const teamGroup = (team: TeamKey, side: Side) => {
    const t = config.teams[team];
    const tone = side === "affirmative" ? "aff" : "neg";
    const teamSpeaking = speakingTeam === team && speakingSpeakerId !== null;
    const speakingMember = teamSpeaking ? t.members.find((m) => m.id === speakingSpeakerId) : undefined;
    const plateMember: AgentConfig =
      speakingMember ?? t.members.find((m) => m.id === t.captainId) ?? t.members[0];

    return (
      <div className={`podium-group side-${tone}`}>
        <div className={`stage-members count-${t.members.length}`}>
          {t.members.map((m) => {
            const avatar = m.avatarId ? avatars.get(m.avatarId) : undefined;
            const isSpeaking = teamSpeaking && speakingSpeakerId === m.id;
            const solo = t.members.length === 1;
            return (
              <div key={m.id} className={`stage-member ${isSpeaking ? "speaking" : ""}`}>
                {avatar ? (
                  <AvatarRenderer
                    avatar={avatar}
                    speaking={isSpeaking}
                    active={isSpeaking}
                    size={isSpeaking || solo ? 190 : 140}
                    maxHeight={isSpeaking || solo ? 230 : 175}
                  />
                ) : (
                  <div className="avatar-placeholder" title={m.name}>
                    <FbAvatar name={m.name} speaking={isSpeaking} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="podium-desk">
          <div className="podium-mic wobble-soft">
            <Art name="mic" className="mic-art" fallback={<FbMic />} />
          </div>
          <Art name={`podium-${tone}`} className="podium-art" fallback={<FbPodium tone={tone} />} />
          <div className={`nameplate tone-${tone} ${teamSpeaking ? "live" : ""}`}>
            <Art name="nameplate" className="nameplate-art" fallback={<FbNameplate tone={tone} />} />
            <span className="nameplate-text">
              <span className={`plate-dot ${teamSpeaking ? "on" : ""}`} />
              {plateMember.name}
              {teamSpeaking && (
                <span className="waveform">
                  <i /><i /><i /><i /><i />
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const banner = (team: TeamKey, side: Side) => {
    const tone = side === "affirmative" ? "aff" : "neg";
    const t = config.teams[team];
    return (
      <div className={`team-banner tone-${tone} wobble-soft`}>
        <span className="banner-text">
          {SIDE_LABEL[side]}・{t.name}
        </span>
        <span className="banner-mode">{t.mode === "council" ? "合議制" : "役割分担制"}</span>
      </div>
    );
  };

  const sign = (team: TeamKey, side: Side) => {
    const tone = side === "affirmative" ? "aff" : "neg";
    const text = signTexts[team];
    const thinkingLabel = teamThinking[team];
    return (
      <div className={`speech-sign sign-${tone} wobble-soft`}>
        <Art name={`speech-sign-${tone}`} className="sign-art" fallback={<FbSpeechSign tone={tone} />} />
        <div className="sign-text">
          {thinkingLabel ? (
            <span className="sign-thinking" title={thinkingLabel}>
              思考中<span className="ellipsis" />
            </span>
          ) : (
            (text ?? "よろしくお願いします！")
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="pc-stage">
      <div className="stage-backdrop">
        <Art name="stage-backdrop" className="backdrop-art" fallback={<FbBackdrop />} />
      </div>

      <div className="stage-curtain curtain-left">
        <Art name="curtain-left" className="curtain-art" fallback={<FbCurtain />} />
      </div>
      <div className="stage-curtain curtain-right">
        <Art name="curtain-right" className="curtain-art" fallback={<FbCurtain flip />} />
      </div>

      <div className="stage-bunting">
        <Art name="bunting" className="bunting-art" fallback={<FbBunting />} />
      </div>

      <div className="stage-tree tree-left wobble-soft">
        <Art name="tree-1" className="tree-art" fallback={<FbTree />} />
      </div>
      <div className="stage-tree tree-right wobble-soft">
        <Art name="tree-2" className="tree-art" fallback={<FbTree />} />
      </div>

      <div className="stage-banners">
        {banner(left, "affirmative")}
        <div className="stage-medallion sway">
          <Art name="vs-medallion" className="medallion-art" fallback={<FbVsMedallion />} />
        </div>
        {banner(right, "negative")}
      </div>

      <div className="stage-signs">
        {sign(left, "affirmative")}
        <div className="sign-spacer" />
        {sign(right, "negative")}
      </div>

      <div className="stage-floor">
        {teamGroup(left, "affirmative")}
        <div className="stage-center-block">
          {/* 審査員席: テーマ看板の後ろから顔を出す */}
          <div className={`judge-bench count-${config.judges.length}`}>
            {config.judges.map((judge) => {
              const avatar = judge.avatarId ? avatars.get(judge.avatarId) : undefined;
              return (
                <div key={judge.id} className="judge-seat" title={judge.name}>
                  {avatar ? (
                    <AvatarRenderer avatar={avatar} speaking={false} size={150} maxHeight={195} />
                  ) : (
                    <div className="avatar-placeholder small">
                      <FbAvatar name={judge.name} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="topic-board pop-in">
            <Art name="topic-board" className="topic-board-art" fallback={<FbTopicBoard />} />
            <div className="topic-ribbon">ディベートテーマ</div>
            <div className="topic-text">{topic}</div>
          </div>
        </div>
        {teamGroup(right, "negative")}
      </div>

      <div className="stage-audience">
        <Art name="audience" className="audience-art" fallback={<FbAudience />} />
      </div>
    </div>
  );
}
