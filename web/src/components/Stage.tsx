import type { AgentConfig, AvatarInfo, MatchConfig, Side, TeamKey, ThinkingInfo } from "@debate-koshien/shared";
import { sideLabel } from "@debate-koshien/shared";
import { useLang, useT } from "../i18n";
import { Art } from "../art/Art";
import {
  FbAudience,
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
 * Paper-craft spectator stage.
 * Affirmative on the left (green), negative on the right (red); only the current speaker's
 * mouth animates. Background, curtains, podiums, etc. prefer assets/ui/ images and fall back
 * to SVG when missing.
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
  const t = useT();
  const { lang } = useLang();
  const left: TeamKey = config.affirmative;
  const right: TeamKey = left === "A" ? "B" : "A";

  // Per-team "thinking" label (to show a "thinking…" speech balloon).
  const teamThinking: Record<TeamKey, string | null> = { A: null, B: null };
  for (const info of Object.values(thinking ?? {})) {
    if (info.scope === "team" && info.team) teamThinking[info.team] = info.label;
  }

  const teamGroup = (team: TeamKey, side: Side) => {
    const tc = config.teams[team];
    const tone = side === "affirmative" ? "aff" : "neg";
    const teamSpeaking = speakingTeam === team && speakingSpeakerId !== null;
    const speakingMember = teamSpeaking ? tc.members.find((m) => m.id === speakingSpeakerId) : undefined;
    const plateMember: AgentConfig =
      speakingMember ?? tc.members.find((m) => m.id === tc.captainId) ?? tc.members[0];

    return (
      <div className={`podium-group side-${tone}`}>
        <div className={`stage-members count-${tc.members.length}`}>
          {tc.members.map((m) => {
            const avatar = m.avatarId ? avatars.get(m.avatarId) : undefined;
            const isSpeaking = teamSpeaking && speakingSpeakerId === m.id;
            const solo = tc.members.length === 1;
            return (
              <div key={m.id} className={`stage-member ${isSpeaking ? "speaking" : ""}`}>
                <AvatarRenderer
                  avatar={avatar}
                  name={m.name}
                  speaking={isSpeaking}
                  active={isSpeaking}
                  size={isSpeaking || solo ? 190 : 140}
                  maxHeight={isSpeaking || solo ? 230 : 175}
                />
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
    const tc = config.teams[team];
    return (
      <div className={`team-banner tone-${tone} wobble-soft`}>
        <span className="banner-text">{t.stage.bannerLine(sideLabel(side, lang), tc.name)}</span>
        <span className="banner-mode">{tc.mode === "council" ? t.stage.modeCouncil : t.stage.modeRoles}</span>
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
              {t.stage.thinking}
              <span className="ellipsis" />
            </span>
          ) : (
            (text ?? t.stage.greeting)
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
          {/* Judges' bench: peeking out from behind the topic board. */}
          <div className={`judge-bench count-${config.judges.length}`}>
            {config.judges.map((judge) => {
              const avatar = judge.avatarId ? avatars.get(judge.avatarId) : undefined;
              return (
                <div key={judge.id} className="judge-seat" title={judge.name}>
                  <AvatarRenderer avatar={avatar} name={judge.name} speaking={false} size={150} maxHeight={195} />
                </div>
              );
            })}
          </div>
          <div className="topic-board pop-in">
            <Art name="topic-board" className="topic-board-art" fallback={<FbTopicBoard />} />
            <div className="topic-ribbon">{t.stage.topicRibbon}</div>
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
