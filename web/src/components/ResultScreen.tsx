import type { AvatarInfo, MatchDetail, MatchEvent, ResultEvent } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";
import { Art } from "../art/Art";
import { FbConfetti, FbGavel, FbTrophy } from "../art/fallbacks";
import { ReviewView } from "./ReviewView";
import { VerdictView } from "./VerdictView";

/** 結果と講評の画面。勝者の発表 → 審査員の判定 → 感想戦レビュー。 */
export function ResultScreen({
  detail,
  events,
  avatars,
}: {
  detail: MatchDetail;
  events: MatchEvent[];
  avatars: Map<string, AvatarInfo>;
}) {
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
              <div className="winner-kicker">勝者</div>
              <div className="winner-name">
                {SIDE_LABEL[result.winner]}・{detail.config.teams[result.winnerTeam].name}
              </div>
              <div className="winner-votes">
                <span className="vote-count aff">肯定 {result.votes.affirmative}</span>
                <span className="vote-sep">—</span>
                <span className="vote-count neg">{result.votes.negative} 否定</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="winner-board pending paper">
          <span className="gavel-mini big">
            <Art name="gavel" className="gavel-art" fallback={<FbGavel />} />
          </span>
          審査員が判定中です<span className="dots" />
        </div>
      )}

      <VerdictView config={detail.config} verdicts={detail.verdicts} result={result} avatars={avatars} />

      {detail.review ? (
        <ReviewView config={detail.config} review={detail.review} />
      ) : (
        (phase === "reviewing" || phase === "judging") && (
          <div className="paper review-pending">
            💬 解説エージェントが感想戦レビューを執筆中<span className="dots" />
          </div>
        )
      )}
    </div>
  );
}
