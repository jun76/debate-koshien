import fs from "node:fs";
import path from "node:path";
import { evidencePrefix, truncateChars, SIDE_LABEL, type Side } from "@debate/shared";
import type { AgentAdapter, AgentInvocation, AgentResult, MockHints } from "./types.js";

/** 文字列から決定的な 32bit ハッシュを作る（モックの分岐用） */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const AFF_ANGLES = ["社会的コストの削減", "当事者の選択肢の拡大", "制度の持続可能性", "国際的な整合性", "技術による代替可能性", "先行事例の成功"];
const NEG_ANGLES = ["移行コストの過小評価", "副作用と新たな格差", "現行制度の改善余地", "先行事例の失敗", "実施可能性の欠如", "価値の毀損"];

function mockEvidence(topic: string, side: Side): object[] {
  const p = evidencePrefix(side);
  const angles = side === "affirmative" ? AFF_ANGLES : NEG_ANGLES;
  return angles.map((angle, i) => ({
    id: `${p}-${String(i + 1).padStart(2, "0")}`,
    claim: `「${topic}」に関して、${angle}の観点から${side === "affirmative" ? "実施を支持" : "実施に反対"}する根拠となる`,
    quote: `モック調査によれば、${angle}について統計的に有意な傾向が確認されており、${side === "affirmative" ? "政策の実施は正味の便益をもたらす" : "政策の実施は正味の損失をもたらす"}と結論づけられている。（これは動作確認用のモック証拠です）`,
    source: {
      title: `${angle}に関する調査報告書`,
      url: `https://example.com/mock/${p.toLowerCase()}${i + 1}`,
      publisher: "モック総合研究所",
      publishedAt: "2025-04-01",
    },
    accessedAt: new Date().toISOString(),
  }));
}

function mockHandoutMd(topic: string, side: Side): string {
  const p = evidencePrefix(side);
  const label = SIDE_LABEL[side];
  const angles = side === "affirmative" ? AFF_ANGLES : NEG_ANGLES;
  const points = angles
    .map((a, i) => `- **${a}** … 証拠 [${p}-${String(i + 1).padStart(2, "0")}]`)
    .join("\n");
  return [
    `# ハンドアウト（${label}）`,
    ``,
    `## 論題`,
    `「${topic}」`,
    ``,
    `## 立場`,
    `${label}として、${side === "affirmative" ? "本論題の実施を支持する" : "本論題の実施に反対する"}。`,
    ``,
    `## 論点構成`,
    points,
    ``,
    `## 注記`,
    `この資料は動作確認用のモックエージェントが生成したものです。`,
    ``,
  ].join("\n");
}

function cite(p: string, n: number): string {
  return `[${p}-${String(n).padStart(2, "0")}]`;
}

function mockConstructive(h: MockHints): string {
  const side = h.side ?? "affirmative";
  const p = evidencePrefix(side);
  const label = side === "affirmative" ? "メリット" : "デメリット";
  const angles = side === "affirmative" ? AFF_ANGLES : NEG_ANGLES;
  return [
    `${SIDE_LABEL[side]}の立論を行います。論題「${h.topic}」について、私たちは${label}を二点提示します。`,
    ``,
    `第一の${label}は「${angles[0]}」です。${cite(p, 1)}が示すとおり、この領域では明確な傾向が確認されています。現状を放置した場合${side === "affirmative" ? "この便益は失われ続けます" : "この損失は生じませんが、実施すれば直ちに顕在化します"}。発生過程は明確であり、${cite(p, 3)}の制度分析がこれを裏づけます。`,
    ``,
    `第二の${label}は「${angles[1]}」です。${cite(p, 2)}によれば、当事者への影響は統計的に有意です。深刻性の観点でも、影響は広範かつ不可逆であり、重要性は高いと言えます。`,
    ``,
    `以上より、${label}は固有性・発生過程・重要性のいずれも満たしています。${SIDE_LABEL[side]}としての立論を終わります。`,
  ].join("\n");
}

function mockRebuttal(h: MockHints, seed: number): string {
  const side = h.side ?? "affirmative";
  const p = evidencePrefix(side);
  const op = evidencePrefix(side === "affirmative" ? "negative" : "affirmative");
  const angles = side === "affirmative" ? AFF_ANGLES : NEG_ANGLES;
  const extra = h.part?.id === "2NR" ? ` さらに新データ${cite(p, 99)}もこの点を補強します。` : "";
  return [
    `${h.part?.label ?? "反駁"}を行います。`,
    ``,
    `まず相手の主張する「${pick(side === "affirmative" ? NEG_ANGLES : AFF_ANGLES, seed)}」への反論です。相手の証拠 ${cite(op, (seed % 3) + 1)} は調査時点が古く、直近の状況を反映していません。私たちの ${cite(p, (seed % 4) + 1)} が示す傾向のほうが現状に即しています。${extra}`,
    ``,
    `次に比較です。相手の論点が仮に成立しても、その影響は限定的かつ回復可能です。一方、私たちの示した「${angles[seed % 2]}」は広範で不可逆です。${cite(p, 2)}の規模感を踏まえれば、比較衡量で${SIDE_LABEL[side]}が優位であることは明らかです。`,
    ``,
    `以上の理由から、本試合は${SIDE_LABEL[side]}に投票されるべきです。`,
  ].join("\n");
}

function mockQuestion(h: MockHints, seed: number): string {
  const op = evidencePrefix(h.side === "affirmative" ? "negative" : "affirmative");
  const targets = [
    `証拠 ${cite(op, (seed % 3) + 1)} の調査対象は本論題の適用範囲と一致していますか。一致する根拠を示してください。`,
    `第${(seed % 2) + 1}の論点について、発生過程の因果関係はどの証拠で裏づけられますか。`,
    `提示された影響の規模は、実施後どの程度の期間で顕在化すると想定していますか。その根拠は何ですか。`,
    `相手側の想定する代替手段では、なぜ同じ効果が得られないのですか。`,
  ];
  return pick(targets, seed);
}

function mockAnswer(h: MockHints, seed: number): string {
  const p = evidencePrefix(h.side ?? "affirmative");
  const answers = [
    `はい。${cite(p, (seed % 3) + 1)} の調査は本論題の対象と同一の制度環境で行われており、適用範囲は一致します。`,
    `発生過程は ${cite(p, (seed % 4) + 1)} の制度分析が段階を追って示しています。因果の飛躍はありません。`,
    `影響は実施後おおむね数年で顕在化すると考えます。${cite(p, 2)} の先行事例が同様の時間経過を示しています。`,
    `代替手段では対象範囲が限定され、${cite(p, 1)} の示す規模の効果は得られません。`,
  ];
  return pick(answers, seed);
}

function mockJudgeJson(h: MockHints, seed: number): string {
  const vote: Side = seed % 100 < 50 ? "affirmative" : "negative";
  const winner = SIDE_LABEL[vote];
  const loser = SIDE_LABEL[vote === "affirmative" ? "negative" : "affirmative"];
  const verdict = {
    vote,
    decisiveIssues: [
      `${winner}の第一論点が反駁を耐えて最後まで残った一方、${loser}の主要論点は質疑で根拠の適用範囲に疑義が生じた`,
      `比較衡量の局面で${winner}のほうが影響の規模と不可逆性を明確に示した`,
    ],
    speechEvaluations: [
      { partId: "1AC", comment: "論点構成は明確で証拠 ID の紐づけも適切" },
      { partId: "1NC", comment: "対抗軸の提示は良いが、一部の主張で証拠との距離がある" },
      { partId: "2NR", comment: "存在しない証拠 ID への言及があり、資料に閉じる原則の点で減点" },
      { partId: "2AR", comment: "比較のまとめは分かりやすいが、新規論点に近い展開が一部見られた" },
    ],
    evidenceAssessment: [
      { evidenceId: (h.evidenceIds ?? ["A-01"])[0] ?? "A-01", reliability: "中", comment: "出典は明示されているが単一ソースで裏取りが薄い" },
      { evidenceId: (h.opponentEvidenceIds ?? ["N-01"])[0] ?? "N-01", reliability: "中", comment: "調査時点がやや古い" },
    ],
    violations:
      seed % 2 === 0
        ? [{ type: "unknown-evidence", partId: "2NR", detail: "封印資料に存在しない証拠 ID の参照" }]
        : [],
    communication: {
      clarity: "両チームともラベル付けが明確で論点整理は良好",
      responsiveness: `${winner}のほうが相手発言への直接の応答が多かった`,
      comment: "質疑の噛み合いはおおむね良好だった",
    },
    reasoning: `メリットとデメリットの比較衡量の結果、${winner}の主要論点の残存度と影響の重大性が上回ると判断し、${winner}に投票する。（モック審査員による自動生成）`,
  };
  return JSON.stringify(verdict);
}

function mockReviewJson(h: MockHints): string {
  const review = {
    decisiveIssues: [`「${(h.topic ?? "論題")}」の影響規模の比較が最終盤の争点となり、第二反駁での処理の差が勝敗を分けた`],
    turningPoints: ["否定側第一反駁で肯定側の第一論点への攻撃が薄く、ここで肯定側の議論が固定化した"],
    strongEvidence: [{ evidenceId: "A-01", comment: "立論から最終反駁まで一貫して参照され、反論を受けなかった" }],
    weakEvidence: [{ evidenceId: "N-02", comment: "質疑で適用範囲を突かれ、以降の反駁で回復できなかった" }],
    effectiveRebuttals: ["肯定側第一反駁での証拠の時点比較は、相手証拠の信頼性を効果的に削った"],
    suspectedOutOfHandout: ["否定側第二反駁の [N-99] は封印資料に存在せず、ハンドアウト外の疑いがある"],
    judgeDifferences: "審査員の判断は比較衡量の重み付けで分かれた。影響の不可逆性を重く見た審査員は肯定側、発生確率を重く見た審査員は否定側に投票した。",
    preparationComparison: "両チームとも証拠6件で量は同等。肯定側は論点と証拠の対応が一対一で明確、否定側は複数論点で同じ証拠を使い回す場面があった。",
    teamOperationComparison: "合議制チームは草案間の重複が多く statement の密度で損をした。役割分担制チームは質疑の噛み合いで優位だった。（モック解説）",
    improvements: {
      A: ["反駁パートでの証拠の再引用を増やし、資料に閉じた議論であることを審査員に示す"],
      B: ["存在しない証拠 ID への言及を避ける。準備フェーズで証拠一覧の最終確認を行う"],
    },
  };
  return JSON.stringify(review);
}

export class MockAdapter implements AgentAdapter {
  readonly provider = "mock";

  async invoke(inv: AgentInvocation): Promise<AgentResult> {
    const started = Date.now();
    const h = inv.mockHints ?? {};
    const seed = hash32(`${inv.matchId}:${inv.agent.id}:${inv.kind}:${h.part?.id ?? ""}:${h.exchangeIndex ?? 0}`);
    // 観戦 UI で進行が見えるよう、わずかに待つ
    await sleep(250 + (seed % 400));

    let output = "";
    switch (inv.kind) {
      case "prep-research":
        output = [
          `# 調査メモ（${inv.agent.name}）`,
          `- 論題「${h.topic}」について${SIDE_LABEL[h.side ?? "affirmative"]}視点の論点候補を整理`,
          `- 有望な角度: ${(h.side === "negative" ? NEG_ANGLES : AFF_ANGLES).slice(0, 3).join(" / ")}`,
          `- 相手の想定主張: ${(h.side === "negative" ? AFF_ANGLES : NEG_ANGLES).slice(0, 2).join(" / ")}`,
          `- 出典候補: モック総合研究所の各種調査報告`,
        ].join("\n");
        break;
      case "prep-compile":
      case "prep-fix": {
        const side = h.side ?? "affirmative";
        fs.writeFileSync(
          path.join(inv.workspaceDir, "evidence.json"),
          JSON.stringify(mockEvidence(h.topic ?? "論題", side), null, 2),
          "utf8",
        );
        fs.writeFileSync(path.join(inv.workspaceDir, "handout.md"), mockHandoutMd(h.topic ?? "論題", side), "utf8");
        const p = evidencePrefix(side);
        output = `作成済み: ${Array.from({ length: 6 }, (_, i) => `${p}-${String(i + 1).padStart(2, "0")}`).join(", ")}`;
        break;
      }
      case "speech":
      case "draft":
        output = h.part?.kind === "constructive" ? mockConstructive(h) : mockRebuttal(h, seed);
        if (inv.kind === "draft") output += `\n（${inv.agent.name} の草案）`;
        break;
      case "merge": {
        // 草案は instructions に含まれるが、モックは代表して自前生成に一言添える
        output = (h.part?.kind === "constructive" ? mockConstructive(h) : mockRebuttal(h, seed)) + `\n（チーム合議を経た最終版）`;
        break;
      }
      case "question":
        output = mockQuestion(h, seed + (h.exchangeIndex ?? 0));
        break;
      case "answer":
        output = mockAnswer(h, seed + (h.exchangeIndex ?? 0));
        break;
      case "regenerate":
        output = truncateChars(inv.instructions.split("# 直前の発言案")[1] ?? "", (h.maxChars ?? 400) - 10).trim();
        break;
      case "judge":
        await sleep(500);
        output = mockJudgeJson(h, seed);
        break;
      case "review":
        await sleep(500);
        output = mockReviewJson(h);
        break;
    }

    if (h.maxChars !== undefined && ["speech", "draft", "merge", "question", "answer"].includes(inv.kind)) {
      // モックは基本的に上限内に収まるよう生成するが、保険で切り詰めない（上限チェックの動作確認は本文で行う）
    }

    return { output, toolUsage: [], durationMs: Date.now() - started };
  }
}
