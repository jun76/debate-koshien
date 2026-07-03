import { useState, type CSSProperties, type ReactNode } from "react";

/**
 * Loader for paper-craft assets.
 * Tries /assets/ui/<name>.png and shows the SVG fallback if it does not exist.
 * Asset images can be swapped in later just by dropping them into assets/ui/.
 * See docs/002_UIアセット一覧.md for the list of slots.
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
