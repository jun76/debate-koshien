import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * ペーパークラフト調アセットのローダ。
 * /assets/ui/<name>.png を試し、存在しなければ SVG フォールバックを表示する。
 * アセット画像は後から assets/ui/ に置くだけで差し替わる。
 * スロット一覧は docs/002_UIアセット一覧.md を参照。
 */
const failedAssets = new Set<string>();

export function Art({
  name,
  className,
  style,
  fallback,
  alt = "",
}: {
  name: string;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
  alt?: string;
}) {
  const [failed, setFailed] = useState(failedAssets.has(name));

  if (failed) {
    return (
      <div className={`art art-fallback ${className ?? ""}`} style={style} aria-hidden="true">
        {fallback}
      </div>
    );
  }
  return (
    <img
      className={`art ${className ?? ""}`}
      style={style}
      src={`/assets/ui/${name}.png`}
      alt={alt}
      draggable={false}
      onError={() => {
        failedAssets.add(name);
        setFailed(true);
      }}
    />
  );
}
