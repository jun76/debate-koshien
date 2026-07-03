import type { Provider, Side } from "@debate/shared";

/**
 * Japanese UI dictionary. This object's shape defines the `Dict` type that the English
 * dictionary must implement, so both languages stay structurally in sync.
 */
export const ja = {
  common: {
    appTitle: "AIディベート甲子園",
    loadingMatch: "試合を読み込んでいます…",
    localeString: "ja-JP",
    none: "（なし）",
    providerLabels: {
      mock: "Mock（動作確認用・即応答）",
      claude: "Claude Code",
      codex: "Codex",
      opencode: "OpenCode",
    } as Record<Provider, string>,
  },

  lobby: {
    kicker: "コーディングエージェント対抗",
    subtitle: "調査・証拠・反駁・審査 — ぜんぶエージェント",
    pastMatches: "過去の試合",
    noMatches: "まだ試合はありません",
    deleteMatch: "試合を削除",
    replayTitle: "デモ再生（最初から観戦）",
    deleteConfirm: (topic: string) =>
      `「${topic}」を削除しますか？\n関連データ一式も data フォルダから削除されます。`,
  },

  wizard: {
    newMatch: "新しい試合",
    exportConfig: "⬇ 設定をエクスポート",
    importConfig: "⬆ インポート",
    resolutionHeading: "論題",
    resolutionPlaceholder:
      "例: 日本は中学校・高等学校の部活動を地域クラブに移行すべきである。是か非か",
    format: "フォーマット",
    affirmativeSelect: "肯定側",
    teamAOption: "チームA",
    teamBOption: "チームB",
    coinToss: "コイントス",
    teamName: "チーム名",
    teamMode: "運用方式",
    councilOption: "合議制 + captain",
    rolesOption: "役割分担制",
    member: (i: number) => `メンバー ${i}`,
    removeMember: "削除",
    addMember: "+ メンバー追加",
    judgesHeading: "審査員",
    count: "人数",
    people: (n: number) => `${n}人`,
    judge: (i: number) => `審査員 ${i}`,
    reviewerHeading: "感想戦の解説担当",
    spectatorOptions: "観戦オプション",
    ttsLabel: "音声読み上げを生成する（試合全体）",
    ttsDisabled: "（piper-plus 未セットアップのため無効）",
    ttsTitle: "準備〜感想戦まで、全ての発言に音声を合成して読み上げます",
    demoLabel: "デモモード（試合を丸ごと先に生成してから、待ち時間なしで再生）",
    demoTitle: "全ての推論と音声生成を先に済ませてから、待ち時間なしで1試合を通しで観戦するモード",
    createStart: "試合を作成して開始",
    demoCreateStart: "デモ試合を生成して開始",
    creating: "作成中…",
    demoGenerating: (progress: string) => `デモ生成中: ${progress}`,
    demoNote: "開戦から決着までの推論と音声を先に生成しています。完了すると自動で観戦が始まります。",
    generatingMatch: "試合を生成中…",
    demoInterrupted: "デモの生成が中断されました",
    configFileError: (msg: string) => `設定ファイルを読み込めません: ${msg}`,
    notJsonObject: "JSON オブジェクトではありません",
    namePlaceholder: "名前（省略可）",
    modelPlaceholder: "モデル（省略可）",
    reasoningDefault: "推論: 既定",
    reasoningTitle: "推論モード",
  },

  header: {
    back: "← 設定",
    abort: "中断",
    aborting: "中断中…",
    abortingNote: "現在の発言生成が終わり次第、停止します。",
    retry: "再試行",
    demoPlayback: "デモ再生",
    replay: "⟲ リプレイ再生",
    replayTitle: "この試合を最初から演出付きで再生",
    audioOn: "🔊 音声 ON",
    audioOff: "🔊 音声 OFF",
    audioTitleAvailable: "音声読み上げ",
    audioTitleUnavailable: "piper-plus 未セットアップ（表示のみ）",
    tabArena: "アリーナ",
    tabResult: "結果発表",
    errorPrefix: "エラー: ",
  },

  cutin: {
    prepTitle: "準備フェーズ開始",
    prepSub: "Web調査 解禁",
    sealedTitle: "ハンドアウト封印",
    sealedSub: "以降の Web 利用は禁止",
    debatingTitle: "試合開始！",
    judgingTitle: "審査開始",
    judgingSub: "審査員は独立に判定します",
    voteTitle: (name: string) => `${name} が投票`,
    voteSub: (side: string) => `${side}へ`,
    resultTitle: "判定発表！",
    resultSub: "結果発表へ",
    speechSub: (side: string, team: string) => `${side}・${team}`,
  },

  arena: {
    prepNoteReplay:
      "🎬 リプレイ再生中 — 記録済みの準備工程をダイジェストで再生しています（推論は行っていません）",
    prepNoteLive:
      "📚 準備フェーズ — 両チームが独立に Web 調査を行い、封印用ハンドアウトを作成中。封印後は Web 利用が実行権限で禁止されます",
    teamLine: (side: string, team: string) => `${side}・${team}`,
    sealed: "ハンドアウト封印済み",
    waiting: "待機中…",
    workLog: "作業記録",
    progress: "進行",
    judging: (n: number, total: number) => `審査中 ${n}/${total}`,
  },

  log: {
    speechLog: "発言ログ",
    showDeliberation: "チーム内合議も表示（観戦者限定・審査員には非公開）",
    noSpeeches: "まだ発言はありません",
    question: (n: number) => `質問 ${n}`,
    answer: (n: number) => `応答 ${n}`,
    chars: (n: number) => `${n}字`,
    synthesizing: "🔊 音声を合成中…",
    autoplayBlocked: "🔇 ブラウザが自動再生をブロックしています — 画面をクリックすると音声が始まります",
    deliberationHead: (team: string, member: string, label: string) =>
      `💭 チーム${team} 内部合議 / ${member}（${label}）`,
    viewContent: "内容を見る",
  },

  verdict: {
    label: "判定",
    winner: (side: string, team: string) => `${side}（${team}）の勝利`,
    votes: (aff: number, neg: number) => `肯定 ${aff} — ${neg} 否定`,
    votedFor: (side: string) => `${side}に投票`,
    deciding: "判定中…",
    detailsSummary: "詳細（決定打・パート評価・証拠評価・違反）",
    decisiveIssues: "勝敗を分けた論点",
    partEval: "パート評価",
    evidenceEval: "証拠評価",
    reliability: "信頼性",
    violations: "指摘された違反・逸脱",
    communication: "コミュニケーション",
    clarity: "明瞭さ",
    responsiveness: "応答性",
  },

  review: {
    title: "感想戦レビュー",
    decisive: "勝敗を決めた論点",
    turning: "流れが変わったポイント",
    strong: "強かった証拠",
    weak: "弱かった証拠",
    rebuttals: "有効だった反駁",
    outOfHandout: "ハンドアウト外と疑われる主張",
    judgeDiff: "審査員間の判断の違い",
    prep: "準備資料の質の比較",
    teamOp: "チーム運用方式の比較",
    improvementsOf: (team: string) => `${team} の改善点`,
  },

  evidence: {
    heading: "証拠資料",
    tab: (side: string, team: string) => `${side}（${team}）`,
    beforeSeal: "封印前のため閲覧できません",
    loading: "読み込み中…",
    sealHash: "封印ハッシュ",
    source: "出典",
    handoutFull: "handout.md 全文",
  },

  result: {
    winnerKicker: "勝者",
    winnerName: (side: string, team: string) => `${side}・${team}`,
    voteAff: (n: number) => `肯定 ${n}`,
    voteNeg: (n: number) => `${n} 否定`,
    judgesDeciding: "審査員が判定中です",
    reviewPending: "💬 解説エージェントが感想戦レビューを執筆中",
  },

  stage: {
    modeCouncil: "合議制",
    modeRoles: "役割分担制",
    thinking: "思考中",
    greeting: "よろしくお願いします！",
    bannerLine: (side: string, team: string) => `${side}・${team}`,
    topicRibbon: "ディベートテーマ",
  },
} satisfies Record<string, unknown>;

export type Dict = typeof ja;
export type { Side };
