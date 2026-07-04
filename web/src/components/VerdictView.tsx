import type { AvatarInfo, MatchConfig, ResultEvent, Verdict } from "@debate-koshien/shared";
import { sideLabel } from "@debate-koshien/shared";
import { useLang, useT } from "../i18n";
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
  const t = useT();
  const { lang } = useLang();
  return (
    <div className="verdict-view">
      {result && (
        <div className={`result-banner ${result.winner}`}>
          <div className="result-label">{t.verdict.label}</div>
          <div className="result-winner">
            {t.verdict.winner(sideLabel(result.winner, lang), config.teams[result.winnerTeam].name)}
          </div>
          <div className="result-votes">{t.verdict.votes(result.votes.affirmative, result.votes.negative)}</div>
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
                      {t.verdict.votedFor(sideLabel(v.vote, lang))}
                    </span>
                  ) : (
                    <span className="vote-chip pending">{t.verdict.deciding}</span>
                  )}
                </div>
              </div>
              {v && (
                <>
                  <div className="judge-reasoning">{v.reasoning}</div>
                  <details>
                    <summary>{t.verdict.detailsSummary}</summary>
                    <div className="judge-detail">
                      <h4>{t.verdict.decisiveIssues}</h4>
                      <ul>
                        {v.decisiveIssues.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                      {v.speechEvaluations.length > 0 && (
                        <>
                          <h4>{t.verdict.partEval}</h4>
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
                          <h4>{t.verdict.evidenceEval}</h4>
                          <ul>
                            {v.evidenceAssessment.map((e, i) => (
                              <li key={i}>
                                <b>{e.evidenceId}</b>（{t.verdict.reliability}: {e.reliability}）: {e.comment}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {v.violations.length > 0 && (
                        <>
                          <h4>{t.verdict.violations}</h4>
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
                      <h4>{t.verdict.communication}</h4>
                      <ul>
                        <li>{t.verdict.clarity}: {v.communication.clarity}</li>
                        <li>{t.verdict.responsiveness}: {v.communication.responsiveness}</li>
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
