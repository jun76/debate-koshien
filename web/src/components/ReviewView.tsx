import type { MatchConfig, Review } from "@debate/shared";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="empty">（なし）</p>;
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function ReviewView({ config, review }: { config: MatchConfig; review: Review }) {
  return (
    <div className="card review-view">
      <h3>感想戦レビュー</h3>
      <Section title="勝敗を決めた論点">
        <List items={review.decisiveIssues} />
      </Section>
      <Section title="流れが変わったポイント">
        <List items={review.turningPoints} />
      </Section>
      <div className="review-cols">
        <Section title="強かった証拠">
          <ul>
            {review.strongEvidence.map((e, i) => (
              <li key={i}>
                <b>{e.evidenceId}</b>: {e.comment}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="弱かった証拠">
          <ul>
            {review.weakEvidence.map((e, i) => (
              <li key={i}>
                <b>{e.evidenceId}</b>: {e.comment}
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title="有効だった反駁">
        <List items={review.effectiveRebuttals} />
      </Section>
      <Section title="ハンドアウト外と疑われる主張">
        <List items={review.suspectedOutOfHandout} />
      </Section>
      <Section title="審査員間の判断の違い">
        <p>{review.judgeDifferences}</p>
      </Section>
      <Section title="準備資料の質の比較">
        <p>{review.preparationComparison}</p>
      </Section>
      <Section title="チーム運用方式の比較">
        <p>{review.teamOperationComparison}</p>
      </Section>
      <div className="review-cols">
        {(["A", "B"] as const).map((team) => (
          <Section key={team} title={`${config.teams[team].name} の改善点`}>
            <List items={review.improvements[team] ?? []} />
          </Section>
        ))}
      </div>
    </div>
  );
}
