import { useEffect, useRef, useState } from "react";
import type { AvatarInfo } from "@debate/shared";
import { FbAvatar } from "../art/fallbacks";

type Mouth = "closed" | "half" | "open";

/** viewBox aspect ratio of FbAvatar (the fallback SVG). */
const FALLBACK_ASPECT = 120 / 150;

/**
 * Lightweight renderer that layers avatar assets in the PuruPuru PNGTuber format.
 * Composites in the order back hair -> items (faceBack) -> expression -> front hair ->
 * items (frontHairFront), with automatic blinking and mouth movement while speaking.
 * When there is no avatar, shows a fallback SVG character using the same size calculation.
 */
export function AvatarRenderer({
  avatar,
  name,
  speaking,
  active,
  size = 120,
  maxHeight,
}: {
  avatar?: AvatarInfo;
  /** Name for the fallback display (used for colors and the nameplate). */
  name?: string;
  speaking: boolean;
  active?: boolean;
  size?: number;
  maxHeight?: number;
}) {
  const [mouth, setMouth] = useState<Mouth>("closed");
  const [blink, setBlink] = useState(false);
  const mouthPhase = useRef(0);

  // Mouth: while speaking, cycle closed -> half -> open -> half.
  useEffect(() => {
    if (!speaking) {
      setMouth("closed");
      return;
    }
    const cycle: Mouth[] = ["half", "open", "half", "closed"];
    const timer = setInterval(() => {
      mouthPhase.current = (mouthPhase.current + 1) % cycle.length;
      setMouth(cycle[mouthPhase.current]);
    }, 130);
    return () => clearInterval(timer);
  }, [speaking]);

  // Auto-blink: close the eyes for 130ms every 2-6 seconds.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        setBlink(true);
        setTimeout(() => {
          if (!alive) return;
          setBlink(false);
          schedule();
        }, 130);
      }, 2000 + Math.random() * 4000);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  const eyes = blink ? "closed" : "open";
  const aspect = avatar
    ? avatar.width > 0 && avatar.height > 0
      ? avatar.width / avatar.height
      : 1
    : FALLBACK_ASPECT;
  const rawHeight = size / aspect;
  const fitScale = maxHeight && rawHeight > maxHeight ? maxHeight / rawHeight : 1;
  const displayWidth = size * fitScale;
  const displayHeight = rawHeight * fitScale;

  if (!avatar) {
    return (
      <div
        className={`avatar ${speaking ? "avatar-speaking" : ""} ${active ? "avatar-active" : ""}`}
        style={{ width: displayWidth, height: displayHeight, position: "relative" }}
        title={name}
      >
        <div className="avatar-inner">
          <FbAvatar name={name ?? "?"} speaking={speaking} />
        </div>
      </div>
    );
  }

  const expression = avatar.layers.expressions[`eyes-${eyes}-mouth-${mouth}`];
  const layerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
  };

  const itemsBack = avatar.layers.items.filter((i) => i.slot !== "frontHairFront");
  const itemsFront = avatar.layers.items.filter((i) => i.slot === "frontHairFront");
  const itemStyle = (item: (typeof avatar.layers.items)[number]): React.CSSProperties => ({
    ...layerStyle,
    transform: `translate(${(item.x / avatar.width) * 100}%, ${(item.y / avatar.height) * 100}%) scale(${item.scale / 100})`,
  });

  return (
    <div
      className={`avatar ${speaking ? "avatar-speaking" : ""} ${active ? "avatar-active" : ""}`}
      style={{ width: displayWidth, height: displayHeight, position: "relative" }}
      title={avatar.name}
    >
      <div className="avatar-inner">
        <img src={avatar.layers.backHair} style={layerStyle} alt="" draggable={false} />
        {itemsBack.map((item, i) => (
          <img key={`b${i}`} src={item.file} style={itemStyle(item)} alt="" draggable={false} />
        ))}
        {expression && <img src={expression} style={layerStyle} alt="" draggable={false} />}
        <img src={avatar.layers.frontHair} style={layerStyle} alt="" draggable={false} />
        {itemsFront.map((item, i) => (
          <img key={`f${i}`} src={item.file} style={itemStyle(item)} alt="" draggable={false} />
        ))}
      </div>
    </div>
  );
}
