import type { AvatarInfo, MatchConfig, ResultEvent, Verdict } from "@debate/shared";
import { SIDE_LABEL } from "@debate/shared";
import { AvatarRenderer } from "./AvatarRenderer";

export function VerdictView({
  config,
  verdicts,
  result,
  avatars,
}: {
  config: MatchConfig;
  verdicts: Verdict[];
  result: ResultEvent | null;
  avatars: Map<string, AvatarInfo>;
}) {
  return (
    <div className="verdict-view">
      {result && (
        <div className={`result-banner ${result.winner}`}>
          <div className="result-label">判定</div>
          <div className="result-winner">
            {SIDE_LABEL[result.winner]}（{config.teams[result.winnerTeam].name}）の勝利
          </div>
          <div className="result-votes">
            肯定 {result.votes.affirmative} — {result.votes.negative} 否定
          </div>
        </div>
      )}
      <div className="judge-grid">
        {config.judges.map((judge) => {
          const v = verdicts.find((x) => x.judgeId === judge.id);
          const avatar = judge.avatarId ? avatars.get(judge.avatarId) : undefined;
          return (
            <div key={judge.id} className="card judge-card">
              <div className="judge-head">
                <div className="judge-avatar-frame">
                  <AvatarRenderer avatar={avatar} name={judge.name} speaking={false} size={64} maxHeight={64} />
                </div>
                <div>
                  <div className="judge-name">{judge.name}</div>
                  {v ? (
                    <span className={`vote-chip ${v.vote === "affirmative" ? "aff" : "neg"}`}>
                      {SIDE_LABEL[v.vote]}に投票
                    </span>
                  ) : (
                    <span className="vote-chip pending">判定中…</span>
                  )}
                </div>
              </div>
              {v && (
                <>
                  <div className="judge-reasoning">{v.reasoning}</div>
                  <details>
                    <summary>詳細（決定打・パート評価・証拠評価・違反）</summary>
                    <div className="judge-detail">
                      <h4>勝敗を分けた論点</h4>
                      <ul>
                        {v.decisiveIssues.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                      {v.speechEvaluations.length > 0 && (
                        <>
                          <h4>パート評価</h4>
                          <ul>
                            {v.speechEvaluations.map((e, i) => (
                              <li key={i}>
                                <b>{e.partId}</b>: {e.comment}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {v.evidenceAssessment.length > 0 && (
                        <>
                          <h4>証拠評価</h4>
                          <ul>
                            {v.evidenceAssessment.map((e, i) => (
                              <li key={i}>
                                <b>{e.evidenceId}</b>（信頼性: {e.reliability}）: {e.comment}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {v.violations.length > 0 && (
                        <>
                          <h4>指摘された違反・逸脱</h4>
                          <ul>
                            {v.violations.map((e, i) => (
                              <li key={i}>
                                ⚠ {e.type}
                                {e.partId && `（${e.partId}）`}: {e.detail}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      <h4>コミュニケーション</h4>
                      <ul>
                        <li>明瞭さ: {v.communication.clarity}</li>
                        <li>応答性: {v.communication.responsiveness}</li>
                        <li>{v.communication.comment}</li>
                      </ul>
                    </div>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
