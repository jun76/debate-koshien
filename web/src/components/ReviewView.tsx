import type { MatchConfig, Review } from "@debate/shared";
import { useT } from "../i18n";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="review-section">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function List({ items }: { items: string[] }) {
  const t = useT();
  if (items.length === 0) return <p className="empty">{t.common.none}</p>;
  return (
    <ul>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export function ReviewView({ config, review }: { config: MatchConfig; review: Review }) {
  const t = useT();
  return (
    <div className="card review-view">
      <h3>{t.review.title}</h3>
      <Section title={t.review.decisive}>
        <List items={review.decisiveIssues} />
      </Section>
      <Section title={t.review.turning}>
        <List items={review.turningPoints} />
      </Section>
      <div className="review-cols">
        <Section title={t.review.strong}>
          <ul>
            {review.strongEvidence.map((e, i) => (
              <li key={i}>
                <b>{e.evidenceId}</b>: {e.comment}
              </li>
            ))}
          </ul>
        </Section>
        <Section title={t.review.weak}>
          <ul>
            {review.weakEvidence.map((e, i) => (
              <li key={i}>
                <b>{e.evidenceId}</b>: {e.comment}
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Section title={t.review.rebuttals}>
        <List items={review.effectiveRebuttals} />
      </Section>
      <Section title={t.review.outOfHandout}>
        <List items={review.suspectedOutOfHandout} />
      </Section>
      <Section title={t.review.judgeDiff}>
        <p>{review.judgeDifferences}</p>
      </Section>
      <Section title={t.review.prep}>
        <p>{review.preparationComparison}</p>
      </Section>
      <Section title={t.review.teamOp}>
        <p>{review.teamOperationComparison}</p>
      </Section>
      <div className="review-cols">
        {(["A", "B"] as const).map((team) => (
          <Section key={team} title={t.review.improvementsOf(config.teams[team].name)}>
            <List items={review.improvements[team] ?? []} />
          </Section>
        ))}
      </div>
    </div>
  );
}
