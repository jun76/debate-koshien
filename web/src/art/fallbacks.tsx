/**
 * アセット画像が未配置のときに表示するペーパークラフト調 SVG フォールバック集。
 * 本番アセットは assets/ui/*.png として後から生成・配置される前提なので、
 * ここでは雰囲気（紙の重なり・丸み・ステッチ）を再現した簡易版にとどめる。
 */

const stitch = { strokeDasharray: "5 6", strokeLinecap: "round" as const };

/** 舞台幕（左右） */
export function FbCurtain({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 120 400" preserveAspectRatio="none" style={{ width: "100%", height: "100%", transform: flip ? "scaleX(-1)" : undefined }}>
      <path d="M0 0 H115 Q100 60 108 130 Q95 200 106 280 Q92 340 104 400 H0 Z" fill="#a03040" />
      <path d="M0 0 H80 Q70 80 78 160 Q64 240 76 320 Q66 370 72 400 H0 Z" fill="#b8404f" />
      <path d="M0 0 H42 Q36 90 42 190 Q32 290 40 400 H0 Z" fill="#cc5560" />
      <path d="M112 8 Q98 66 105 132" fill="none" stroke="#7d2331" strokeWidth="3" {...stitch} />
    </svg>
  );
}

/** ガーランド（三角旗の列） */
export function FbBunting() {
  const colors = ["#e9a93d", "#2e8073", "#bf4050", "#5b8fb9", "#e9a93d", "#2e8073", "#bf4050", "#5b8fb9"];
  return (
    <svg viewBox="0 0 800 70" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <path d="M0 12 Q400 46 800 12" fill="none" stroke="#8a6a44" strokeWidth="4" />
      {colors.map((c, i) => {
        const x = 40 + i * 96;
        const y = 14 + Math.sin((i / colors.length) * Math.PI) * 22;
        return <path key={i} d={`M${x} ${y} L${x + 44} ${y + 2} L${x + 20} ${y + 44} Z`} fill={c} stroke="#00000018" strokeWidth="2" />;
      })}
    </svg>
  );
}

/** VS メダリオン（吊り下げ） */
export function FbVsMedallion() {
  return (
    <svg viewBox="0 0 160 210" style={{ width: "100%", height: "100%" }}>
      <path d="M80 0 L34 76 M80 0 L126 76" stroke="#8a6a44" strokeWidth="5" fill="none" />
      <circle cx="80" cy="130" r="72" fill="#caa066" />
      <circle cx="80" cy="130" r="62" fill="#f3e3c2" stroke="#8a6a44" strokeWidth="3" {...stitch} />
      <text x="80" y="152" textAnchor="middle" fontSize="52" fontWeight="900" fill="#4a3826" fontFamily="'M PLUS Rounded 1c', sans-serif">
        VS
      </text>
    </svg>
  );
}

/** 演台（チームカラー） */
export function FbPodium({ tone }: { tone: "aff" | "neg" }) {
  const main = tone === "aff" ? "#2e8073" : "#bf4050";
  const deep = tone === "aff" ? "#1f5d54" : "#8e2c3a";
  return (
    <svg viewBox="0 0 260 150" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <path d="M14 0 H246 L258 150 H2 Z" fill="#d9b98a" />
      <path d="M22 10 H238 L248 140 H12 Z" fill={main} stroke="#00000022" strokeWidth="3" />
      <circle cx="130" cy="78" r="30" fill={deep} />
      <circle cx="130" cy="78" r="22" fill="#f3e3c2" opacity="0.9" />
      <path d="M130 64 l5 10 11 1 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -1 Z" fill={deep} />
    </svg>
  );
}

/** マイク */
export function FbMic() {
  return (
    <svg viewBox="0 0 60 90" style={{ width: "100%", height: "100%" }}>
      <rect x="26" y="40" width="8" height="34" rx="4" fill="#8a6a44" />
      <path d="M14 74 H46 L42 88 H18 Z" fill="#6f5436" />
      <circle cx="30" cy="26" r="18" fill="#4a3826" />
      <circle cx="24" cy="20" r="5" fill="#ffffff55" />
    </svg>
  );
}

/** 観客シルエット（一列分。横リピート想定） */
export function FbAudience() {
  const tones = ["#9b8262", "#7d6752", "#b09876", "#8a7460", "#a58a68"];
  return (
    <svg viewBox="0 0 900 110" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {Array.from({ length: 14 }, (_, i) => {
        const x = 20 + i * 64 + (i % 2) * 10;
        const y = 34 + ((i * 13) % 3) * 10;
        const c = tones[i % tones.length];
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="20" fill={c} />
            <path d={`M${x - 30} 110 Q${x} ${y + 18} ${x + 30} 110 Z`} fill={c} />
          </g>
        );
      })}
    </svg>
  );
}

/** 木（丸い葉が段になった紙の木） */
export function FbTree() {
  return (
    <svg viewBox="0 0 120 160" style={{ width: "100%", height: "100%" }}>
      <rect x="52" y="112" width="16" height="40" rx="6" fill="#8a6a44" />
      <path d="M60 6 Q108 46 92 78 Q112 96 84 116 H36 Q8 96 28 78 Q12 46 60 6 Z" fill="#3d8a63" />
      <path d="M60 22 Q94 52 82 76 Q98 92 76 106 H44 Q22 92 38 76 Q26 52 60 22 Z" fill="#59a877" opacity="0.85" />
    </svg>
  );
}

/** 論題ボード（クラフト紙の掲示板） */
export function FbTopicBoard() {
  return (
    <svg viewBox="0 0 420 150" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <rect x="4" y="6" width="412" height="140" rx="16" fill="#caa066" />
      <rect x="12" y="14" width="396" height="124" rx="12" fill="#f3e3c2" stroke="#8a6a44" strokeWidth="3" {...stitch} />
      <circle cx="28" cy="30" r="5" fill="#8a6a44" />
      <circle cx="392" cy="30" r="5" fill="#8a6a44" />
      <circle cx="28" cy="122" r="5" fill="#8a6a44" />
      <circle cx="392" cy="122" r="5" fill="#8a6a44" />
    </svg>
  );
}

/** ネームプレート */
export function FbNameplate({ tone }: { tone: "aff" | "neg" | "neutral" }) {
  const edge = tone === "aff" ? "#2e8073" : tone === "neg" ? "#bf4050" : "#8a6a44";
  return (
    <svg viewBox="0 0 220 54" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <rect x="2" y="4" width="216" height="48" rx="12" fill={edge} />
      <rect x="6" y="2" width="208" height="44" rx="10" fill="#fdf6e6" stroke="#00000022" strokeWidth="2" />
    </svg>
  );
}

/** 吹き出し看板 */
export function FbSpeechSign({ tone }: { tone: "aff" | "neg" }) {
  const edge = tone === "aff" ? "#2e8073" : "#bf4050";
  const tail = tone === "aff" ? "M196 96 L230 120 L200 100" : "M24 96 L-10 120 L20 100";
  return (
    <svg viewBox="0 0 220 130" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <rect x="4" y="8" width="212" height="98" rx="18" fill="#e2cba0" />
      <rect x="0" y="0" width="212" height="98" rx="18" fill="#fdf6e6" stroke={edge} strokeWidth="4" />
      <path d={tail} fill="#fdf6e6" stroke={edge} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
}

/** 背景（空・丘・街並み） */
export function FbBackdrop() {
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" style={{ width: "100%", height: "100%" }}>
      <rect width="1200" height="420" fill="#bfe0e8" />
      <circle cx="200" cy="80" r="46" fill="#fdf6e6" opacity="0.9" />
      <ellipse cx="260" cy="92" rx="60" ry="28" fill="#fdf6e6" opacity="0.9" />
      <ellipse cx="950" cy="60" rx="70" ry="26" fill="#fdf6e6" opacity="0.8" />
      <g fill="#dcd2ba" opacity="0.9">
        <rect x="80" y="180" width="70" height="160" rx="8" />
        <rect x="170" y="140" width="56" height="200" rx="8" />
        <rect x="950" y="160" width="76" height="180" rx="8" />
        <rect x="1050" y="200" width="60" height="140" rx="8" />
        <path d="M480 200 h60 v140 h-60 z M560 160 h50 v180 h-50 z M630 220 h56 v120 h-56 z" />
      </g>
      <path d="M-20 420 Q200 280 460 380 Q700 300 900 380 Q1080 320 1220 400 V420 Z" fill="#7fae7e" />
      <path d="M-20 420 Q260 340 560 404 Q860 344 1220 416 V420 Z" fill="#5f9a68" />
    </svg>
  );
}

/** 封印スタンプ */
export function FbSealStamp() {
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
      <circle cx="60" cy="60" r="54" fill="none" stroke="#bf4050" strokeWidth="6" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#bf4050" strokeWidth="2" {...stitch} />
      <text x="60" y="76" textAnchor="middle" fontSize="42" fontWeight="900" fill="#bf4050" fontFamily="serif">
        封
      </text>
    </svg>
  );
}

/** 木槌（審査） */
export function FbGavel() {
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
      <rect x="18" y="70" width="72" height="14" rx="7" transform="rotate(-35 54 77)" fill="#8a6a44" />
      <rect x="52" y="14" width="44" height="30" rx="8" transform="rotate(35 74 29)" fill="#a5825a" />
      <rect x="10" y="96" width="60" height="12" rx="6" fill="#6f5436" />
    </svg>
  );
}

/** トロフィー */
export function FbTrophy() {
  return (
    <svg viewBox="0 0 140 150" style={{ width: "100%", height: "100%" }}>
      <path d="M35 16 h70 v30 q0 34 -35 44 q-35 -10 -35 -44 Z" fill="#e9a93d" stroke="#b57f22" strokeWidth="4" />
      <path d="M35 24 h-16 q-4 26 26 34 M105 24 h16 q4 26 -26 34" fill="none" stroke="#b57f22" strokeWidth="6" />
      <rect x="60" y="90" width="20" height="20" fill="#b57f22" />
      <path d="M44 110 h52 l8 24 H36 Z" fill="#8a6a44" />
      <path d="M70 34 l6 12 13 2 -9 9 2 13 -12 -6 -12 6 2 -13 -9 -9 13 -2 Z" fill="#fdf6e6" />
    </svg>
  );
}

/** 紙吹雪 */
export function FbConfetti() {
  const colors = ["#e9a93d", "#2e8073", "#bf4050", "#5b8fb9", "#d97fb0"];
  return (
    <svg viewBox="0 0 600 200" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {Array.from({ length: 42 }, (_, i) => {
        const x = (i * 137) % 600;
        const y = (i * 53) % 200;
        const r = (i * 47) % 360;
        return <rect key={i} x={x} y={y} width="10" height="6" rx="2" fill={colors[i % colors.length]} transform={`rotate(${r} ${x} ${y})`} />;
      })}
    </svg>
  );
}

/** 準備フェーズの作業テント */
export function FbPrepTent({ tone }: { tone: "aff" | "neg" }) {
  const main = tone === "aff" ? "#2e8073" : "#bf4050";
  const pale = tone === "aff" ? "#d9efe9" : "#f7dede";
  return (
    <svg viewBox="0 0 220 150" style={{ width: "100%", height: "100%" }}>
      <path d="M110 8 L208 96 H12 Z" fill={main} />
      <path d="M110 8 L166 96 H54 Z" fill={pale} />
      <path d="M110 8 L208 96 H176 L110 30 L44 96 H12 Z" fill="#00000014" />
      <rect x="24" y="96" width="172" height="10" rx="5" fill="#8a6a44" />
      <rect x="84" y="106" width="52" height="36" rx="6" fill="#d9b98a" />
      <rect x="90" y="112" width="40" height="24" rx="4" fill="#fdf6e6" />
    </svg>
  );
}

/** 虫めがね（調査中） */
export function FbMagnifier() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
      <circle cx="42" cy="42" r="26" fill="#bfe0e8" stroke="#8a6a44" strokeWidth="8" />
      <rect x="60" y="58" width="34" height="14" rx="7" transform="rotate(45 60 58)" fill="#8a6a44" />
      <path d="M30 34 Q38 26 48 30" stroke="#ffffffaa" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
