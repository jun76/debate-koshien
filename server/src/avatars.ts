import fs from "node:fs";
import path from "node:path";
import type { AvatarInfo, AvatarItemLayer } from "@debate/shared";
import { AVATARS_DIR } from "./paths.js";

const EXPRESSION_FILES = [
  "eyes-open-mouth-closed",
  "eyes-open-mouth-half",
  "eyes-open-mouth-open",
  "eyes-closed-mouth-closed",
  "eyes-closed-mouth-half",
  "eyes-closed-mouth-open",
] as const;

/** Scan assets/avatars/ and enumerate avatars in the PuruPuru PNGTuber format. */
export function listAvatars(): AvatarInfo[] {
  if (!fs.existsSync(AVATARS_DIR)) return [];
  const out: AvatarInfo[] = [];
  for (const ent of fs.readdirSync(AVATARS_DIR, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(AVATARS_DIR, ent.name);
    const required = [...EXPRESSION_FILES.map((f) => `${f}.png`), "front-hair.png", "back-hair.png"];
    if (!required.every((f) => fs.existsSync(path.join(dir, f)))) continue;

    let width = 1024;
    let height = 1536;
    const items: AvatarItemLayer[] = [];
    const settingsFile = path.join(dir, "default-settings.json");
    if (fs.existsSync(settingsFile)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsFile, "utf8")) as {
          avatarImageSize?: { width: number; height: number };
          itemLayers?: { file?: string; slot?: string; x?: number; y?: number; scale?: number; visible?: boolean }[];
        };
        if (settings.avatarImageSize) {
          width = settings.avatarImageSize.width;
          height = settings.avatarImageSize.height;
        }
        for (const item of settings.itemLayers ?? []) {
          if (!item.file || item.visible === false) continue;
          if (!fs.existsSync(path.join(dir, item.file))) continue;
          items.push({
            file: `/assets/avatars/${ent.name}/${item.file}`,
            slot: item.slot ?? "faceBack",
            x: item.x ?? 0,
            y: item.y ?? 0,
            scale: item.scale ?? 100,
            visible: true,
          });
        }
      } catch {
        // Even if the settings are broken, the images alone are enough to render.
      }
    }

    const base = `/assets/avatars/${ent.name}`;
    const expressions: Record<string, string> = {};
    for (const f of EXPRESSION_FILES) expressions[f] = `${base}/${f}.png`;

    out.push({
      id: ent.name,
      name: ent.name,
      width,
      height,
      layers: {
        backHair: `${base}/back-hair.png`,
        frontHair: `${base}/front-hair.png`,
        expressions,
        items,
      },
    });
  }
  return out;
}
