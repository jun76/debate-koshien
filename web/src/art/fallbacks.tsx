/**
 * Paper-craft SVG fallbacks shown when the asset images are not in place.
 * The production assets are expected to be generated/placed later as assets/ui/*.png, so these
 * are simplified versions that just reproduce the vibe (paper layering, rounded shapes, stitching).
 */

const stitch = { strokeDasharray: "5 6", strokeLinecap: "round" as const };

/** Stage curtains (left/right). */
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

/** Bunting (a row of triangular flags). */
export function FbBunting() {
  const colors = ["#e9a93d", "#2e8073", "#bf4050", "#5b8fb9", "#e9a93d", "#2e8073", "#bf4050", "#5b8fb9"];
  const ropeY = (x: number) => {
    const t = x / 800;
    return 12 * (1 - t) * (1 - t) + 92 * (1 - t) * t + 12 * t * t;
  };
  return (
    // Overlay each flag's top edge on the rope curve. Give the viewBox headroom so the tips (max y ~= 78) fit.
    <svg viewBox="0 0 800 96" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {colors.map((c, i) => {
        const x = 40 + i * 96;
        const leftY = ropeY(x) - 1;
        const rightY = ropeY(x + 44) - 1;
        const tipY = Math.max(leftY, rightY) + 44;
        return <path key={i} d={`M${x} ${leftY} L${x + 44} ${rightY} L${x + 20} ${tipY} Z`} fill={c} stroke="#00000018" strokeWidth="2" />;
      })}
      <path d="M0 12 Q400 46 800 12" fill="none" stroke="#8a6a44" strokeWidth="4" />
    </svg>
  );
}

/** VS medallion (hanging). */
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

/** Podium (team color). */
export function FbPodium({ tone }: { tone: "aff" | "neg" }) {
  const main = tone === "aff" ? "#2e8073" : "#bf4050";
  const deep = tone === "aff" ? "#1f5d54" : "#8e2c3a";
  return (
    <svg viewBox="0 0 260 150" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <path d="M14 0 H246 L258 150 H2 Z" fill="#d9b98a" />
      <path d="M22 10 H238 L248 140 H12 Z" fill={main} stroke="#00000022" strokeWidth="3" />
      <circle cx="130" cy="94" r="30" fill={deep} />
      <circle cx="130" cy="94" r="22" fill="#f3e3c2" opacity="0.9" />
      <path d="M130 80 l5 10 11 1 -8 8 2 11 -10 -5 -10 5 2 -11 -8 -8 11 -1 Z" fill={deep} />
    </svg>
  );
}

/** Microphone. */
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

/** Audience silhouettes (one row; meant to repeat horizontally). */
export function FbAudience() {
  const tones = ["#9b8262", "#7d6752", "#b09876", "#8a7460", "#a58a68"];
  return (
    <svg viewBox="0 0 900 96" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      {Array.from({ length: 14 }, (_, i) => {
        const x = 20 + i * 64 + (i % 2) * 10;
        const y = 38 + ((i * 13) % 3) * 8;
        const c = tones[i % tones.length];
        // Overlap the shoulder's rounded top with the head (bottom y+20) so the head does not look detached.
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx="12" ry="18" fill={c} />
            <path
              d={`M${x - 24} 96 L${x - 24} ${y + 26} Q${x - 24} ${y + 8} ${x} ${y + 8} Q${x + 24} ${y + 8} ${x + 24} ${y + 26} L${x + 24} 96 Z`}
              fill={c}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Tree (a paper tree with tiers of rounded foliage). */
export function FbTree() {
  return (
    <svg viewBox="0 0 120 160" style={{ width: "100%", height: "100%" }}>
      <rect x="52" y="112" width="16" height="48" rx="6" fill="#8a6a44" />
      <path d="M60 6 Q108 46 92 78 Q112 96 84 116 H36 Q8 96 28 78 Q12 46 60 6 Z" fill="#3d8a63" />
      <path d="M60 22 Q94 52 82 76 Q98 92 76 106 H44 Q22 92 38 76 Q26 52 60 22 Z" fill="#59a877" opacity="0.85" />
    </svg>
  );
}

/** Topic board (a kraft-paper notice board). */
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

/** Nameplate. */
export function FbNameplate({ tone }: { tone: "aff" | "neg" | "neutral" }) {
  const edge = tone === "aff" ? "#2e8073" : tone === "neg" ? "#bf4050" : "#8a6a44";
  return (
    <svg viewBox="0 0 220 54" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <rect x="2" y="4" width="216" height="48" rx="12" fill={edge} />
      <rect x="6" y="2" width="208" height="44" rx="10" fill="#fdf6e6" stroke="#00000022" strokeWidth="2" />
    </svg>
  );
}

/** Speech-bubble sign. */
export function FbSpeechSign({ tone }: { tone: "aff" | "neg" }) {
  const edge = tone === "aff" ? "#2e8073" : "#bf4050";
  return (
    <svg viewBox="0 0 220 110" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
      <rect x="4" y="8" width="212" height="98" rx="18" fill="#e2cba0" />
      <rect x="0" y="0" width="212" height="98" rx="18" fill="#fdf6e6" stroke={edge} strokeWidth="4" />
    </svg>
  );
}

/** Backdrop (sky, hills, townscape). */
export function FbBackdrop() {
  return (
    <svg viewBox="0 0 1200 420" preserveAspectRatio="xMidYMax slice" style={{ width: "100%", height: "100%" }}>
      <rect width="1200" height="420" fill="#bfe0e8" />
      <circle cx="200" cy="80" r="46" fill="#fdf6e6" opacity="0.9" />
      <ellipse cx="260" cy="92" rx="60" ry="28" fill="#fdf6e6" opacity="0.9" />
      <ellipse cx="950" cy="60" rx="70" ry="26" fill="#fdf6e6" opacity="0.8" />
      <g fill="#dcd2ba" opacity="0.9">
        <rect x="80" y="180" width="70" height="210" rx="8" />
        <rect x="170" y="140" width="56" height="250" rx="8" />
        <rect x="950" y="160" width="76" height="230" rx="8" />
        <rect x="1050" y="200" width="60" height="190" rx="8" />
        <path d="M480 200 h60 v190 h-60 z M560 160 h50 v230 h-50 z M630 220 h56 v170 h-56 z" />
      </g>
      <path d="M-20 420 Q200 280 460 380 Q700 300 900 380 Q1080 320 1220 400 V420 Z" fill="#7fae7e" />
      <path d="M-20 420 Q260 340 560 404 Q860 344 1220 416 V420 Z" fill="#5f9a68" />
    </svg>
  );
}

/** Seal stamp (text-free wax-seal design so it reads in any language). */
export function FbSealStamp() {
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
      <circle cx="60" cy="60" r="54" fill="none" stroke="#bf4050" strokeWidth="6" />
      <circle cx="60" cy="60" r="44" fill="none" stroke="#bf4050" strokeWidth="2" {...stitch} />
      {/* 中央は文字ではなく星型の封蝋モチーフ */}
      <path
        d="M60 26 l8.2 16.6 18.3 2.7 -13.2 12.9 3.1 18.2 -16.4 -8.6 -16.4 8.6 3.1 -18.2 -13.2 -12.9 18.3 -2.7 Z"
        fill="#bf4050"
      />
      <path d="M47 40 q6 -6 14 -5" stroke="#ffffff88" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Gavel (judging): head with end caps and a handle, tilted mid-swing over a sound block. */
export function FbGavel() {
  return (
    <svg viewBox="0 0 120 120" style={{ width: "100%", height: "100%" }}>
      {/* Sound block */}
      <rect x="12" y="98" width="62" height="10" rx="5" fill="#6f5436" />
      <rect x="20" y="90" width="46" height="10" rx="5" fill="#8a6a44" />
      {/* Handle + head, tilted as one group */}
      <g transform="rotate(-38 58 56)">
        <rect x="54" y="40" width="9" height="50" rx="4.5" fill="#8a6a44" stroke="#6f5436" strokeWidth="2" />
        <rect x="32" y="16" width="53" height="26" rx="11" fill="#a5825a" stroke="#6f5436" strokeWidth="2.5" />
        <rect x="27" y="12" width="13" height="34" rx="6" fill="#6f5436" />
        <rect x="77" y="12" width="13" height="34" rx="6" fill="#6f5436" />
        <path d="M45 24 q9 -4 18 -2" stroke="#ffffff66" strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      {/* Impact sparks */}
      <path d="M74 76 l7 -7 M82 86 l9 -3 M66 70 l2 -9" stroke="#e9a93d" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

/** Trophy. */
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

/** Confetti. */
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

/** Preparation-phase envelope (half-open while researching, closed after sealing). */
export function FbPrepEnvelope({ tone, sealed = false }: { tone: "aff" | "neg"; sealed?: boolean }) {
  const main = tone === "aff" ? "#2e8073" : "#bf4050";
  const deep = tone === "aff" ? "#1f5d54" : "#8e2c3a";
  const pale = tone === "aff" ? "#e9f4f0" : "#faeaea";
  return (
    <svg viewBox="0 0 220 150" style={{ width: "100%", height: "100%" }}>
      {sealed ? (
        <>
          {/* 封緘済み: 本体 + 閉じたフラップ + チームカラーの封蝋 */}
          <rect x="10" y="24" width="200" height="112" rx="10" fill="#e2cba0" />
          <rect x="6" y="18" width="200" height="112" rx="10" fill="#fdf6e6" stroke="#8a6a44" strokeWidth="3" />
          <path d="M10 124 L106 78 L202 124" fill="none" stroke="#d9c49a" strokeWidth="2.5" />
          <path d="M8 22 L106 86 L204 22 Z" fill={pale} stroke="#8a6a44" strokeWidth="3" strokeLinejoin="round" />
          <path
            d="M106 60 q14 -4 20 6 q10 2 8 13 q6 9 -4 15 q-2 10 -14 9 q-10 6 -18 -2 q-12 1 -13 -11 q-8 -8 0 -16 q1 -11 12 -12 q4 -4 9 -2 Z"
            fill={main}
          />
          <circle cx="106" cy="83" r="15" fill={deep} />
          <circle cx="106" cy="83" r="11" fill="none" stroke={pale} strokeWidth="1.6" strokeDasharray="3 3" />
          <path d="M106 76 l3 5 6 1 -4 4 1 6 -6 -3 -6 3 1 -6 -4 -4 6 -1 Z" fill={pale} />
          <path d="M96 70 q5 -4 11 -3" stroke="#ffffff66" strokeWidth="3" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* 作成中: フラップを起こした開封状態。フラップは本体の後ろに描き、
              紙の裏面なので本体よりわずかに暗い無地にする */}
          <path d="M10 62 L106 6 L202 62 Z" fill="#f1e3c6" stroke="#8a6a44" strokeWidth="3" strokeLinejoin="round" />
          {/* 本体（手前） */}
          <rect x="10" y="66" width="200" height="70" rx="10" fill="#e2cba0" />
          <rect x="6" y="60" width="200" height="70" rx="10" fill="#fdf6e6" stroke="#8a6a44" strokeWidth="3" />
          {/* 手前ポケットの折り目 */}
          <path d="M12 126 L106 92 L200 126" fill="none" stroke="#d9c49a" strokeWidth="2.5" />
        </>
      )}
    </svg>
  );
}

/** Magnifier (researching). */
export function FbMagnifier() {
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
      <circle cx="42" cy="42" r="26" fill="#bfe0e8" stroke="#8a6a44" strokeWidth="8" />
      <rect x="60" y="58" width="34" height="14" rx="7" transform="rotate(45 60 58)" fill="#8a6a44" />
      <path d="M30 34 Q38 26 48 30" stroke="#ffffffaa" strokeWidth="5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Fallback character shown when avatar assets (assets/avatars/) are missing.
 * A paper-craft character whose colors are derived from the name, with only CSS-driven blinking
 * and mouth movement while speaking (see .fb-avatar in styles.css).
 */
const FB_AVATAR_PALETTES = [
  { hair: "#5b4a3f", cloth: "#2e8073" },
  { hair: "#8a5a33", cloth: "#bf4050" },
  { hair: "#3f4a5b", cloth: "#5b8fb9" },
  { hair: "#6b4a6e", cloth: "#e9a93d" },
  { hair: "#2f4f4a", cloth: "#8f6bb0" },
  { hair: "#704438", cloth: "#c47a3d" },
];

export function FbAvatar({ name, speaking = false }: { name: string; speaking?: boolean }) {
  let h = 0;
  for (const ch of name) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0;
  const p = FB_AVATAR_PALETTES[h % FB_AVATAR_PALETTES.length];
  // Two hairstyles for variety, picked deterministically from the name.
  const long = (h >> 3) % 2 === 0;
  return (
    <svg viewBox="0 0 120 150" className={`fb-avatar ${speaking ? "speaking" : ""}`} style={{ width: "100%", height: "100%" }}>
      {/* Back hair: long style falls past the shoulders; short style is a trimmed round cut. */}
      {long ? (
        <path
          d="M28 62 Q26 30 60 28 Q94 30 92 62 L95 106 Q88 114 80 106 L78 74 Q60 82 42 74 L40 106 Q32 114 25 106 Z"
          fill={p.hair}
        />
      ) : (
        <ellipse cx="60" cy="60" rx="34" ry="31" fill={p.hair} />
      )}
      {/* Body (shoulders raised and overlapped with the chin so the neck does not float). */}
      <path d="M22 150 Q24 104 60 100 Q96 104 98 150 Z" fill={p.cloth} stroke="#00000018" strokeWidth="2" />
      {/* Crew-neck collar. */}
      <path d="M50 102 Q60 111 70 102" fill="none" stroke="#fffaf0" strokeWidth="4" strokeLinecap="round" />
      {/* Face (drawn on top of the body). */}
      <circle cx="60" cy="74" r="30" fill="#f7e3cf" stroke="#00000010" strokeWidth="2" />
      {/* M-shaped hairline: two arches with a soft center peak. */}
      <path
        d="M31 64 Q31 38 60 36 Q89 38 89 64 Q80 47 62 56 Q60 57 58 56 Q40 47 31 64 Z"
        fill={p.hair}
      />
      {/* Side strands framing the face. */}
      <path d="M31 58 Q26 74 30 86 Q36 84 36 72 Q34 64 31 58 Z" fill={p.hair} />
      <path d="M89 58 Q94 74 90 86 Q84 84 84 72 Q86 64 89 58 Z" fill={p.hair} />
      {/* Eyes (blink via CSS scaleY). */}
      <g className="fb-eyes">
        <circle cx="48" cy="77" r="3.6" fill="#4a3826" />
        <circle cx="72" cy="77" r="3.6" fill="#4a3826" />
      </g>
      {/* Cheeks. */}
      <circle cx="41" cy="86" r="4.4" fill="#f0b2a0" opacity="0.7" />
      <circle cx="79" cy="86" r="4.4" fill="#f0b2a0" opacity="0.7" />
      {/* Mouth (animates via CSS while speaking). */}
      <ellipse className="fb-mouth" cx="60" cy="93" rx="6" ry="3" fill="#a05046" />
    </svg>
  );
}
