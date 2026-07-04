import type { AvatarInfo, MatchDetail, MatchEvent, ResultEvent } from "@debate-koshien/shared";
import { sideLabel } from "@debate-koshien/shared";
import { Art } from "../art/Art";
import { FbConfetti, FbGavel, FbTrophy } from "../art/fallbacks";
import { useLang, useT } from "../i18n";
import { ReviewView } from "./ReviewView";
import { VerdictView } from "./VerdictView";

/** Result & review screen: winner announcement -> judges' verdicts -> post-match review. */
export function ResultScreen({
  detail,
  events,
  avatars,
}: {
  detail: MatchDetail;
  events: MatchEvent[];
  avatars: Map<string, AvatarInfo>;
}) {
  const t = useT();
  const { lang } = useLang();
  const result = [...events].reverse().find((e): e is ResultEvent => e.type === "result") ?? null;
  const phase = detail.state.phase;

  return (
    <div className="result-screen">
      {result ? (
        <div className={`winner-board tone-${result.winner === "affirmative" ? "aff" : "neg"} pop-in`}>
          <div className="confetti-strip">
            <Art name="confetti" className="confetti-art" fallback={<FbConfetti />} />
          </div>
          <div className="winner-inner">
            <div className="winner-trophy sway">
              <Art name="trophy" className="trophy-art" fallback={<FbTrophy />} />
            </div>
            <div>
              <div className="winner-kicker">{t.result.winnerKicker}</div>
              <div className="winner-name">
                {t.result.winnerName(sideLabel(result.winner, lang), detail.config.teams[result.winnerTeam].name)}
              </div>
              <div className="winner-votes">
                <span className="vote-count aff">{t.result.voteAff(result.votes.affirmative)}</span>
                <span className="vote-sep">—</span>
                <span className="vote-count neg">{t.result.voteNeg(result.votes.negative)}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="winner-board pending paper">
          <span className="gavel-mini big">
            <Art name="gavel" className="gavel-art" fallback={<FbGavel />} />
          </span>
          {t.result.judgesDeciding}<span className="dots" />
        </div>
      )}

      <VerdictView config={detail.config} verdicts={detail.verdicts} result={result} avatars={avatars} />

      {detail.review ? (
        <ReviewView config={detail.config} review={detail.review} />
      ) : (
        (phase === "reviewing" || phase === "judging") && (
          <div className="paper review-pending">
            {t.result.reviewPending}<span className="dots" />
          </div>
        )
      )}
    </div>
  );
}
