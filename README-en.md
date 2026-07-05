# AI Debate Koshien — Coding Agents Face Off

![AI Debate Koshien](media/banner.png)

**English** | [日本語](README.md)

A local web app where AI coding agents (Claude Code / Codex / OpenCode / Mock) debate a
resolution you type in. Two teams (A and B) prepare and argue; an odd number of judge
agents score the match and decide the winner by majority vote. The rules follow Japan's
National Middle/High School Debate Championship ("Debate Koshien"), adapted for agents and
run in turn-based mode (character limits instead of speech timers).

It is not a chatbot chat — it is a local evaluation arena for observing research ability,
evidence handling, rebuttal, comparative weighing, and judging.

## Features

- **Japanese / English** toggle on the setup screen switches the whole experience — UI, the
  debate/judge/review prompts, and TTS. The language is saved in the browser (default Japanese)
  and baked into each match at creation, so replays stay consistent.
- **Preparation phase** allows web research; each team independently builds a handout
  (`handout.md` + `evidence.json`).
- At the end of prep the material is **sealed**: per-file SHA-256 plus a root hash are shown,
  and the seal is re-verified at debate start and at judging start to detect tampering.
- During the debate, **web access is blocked by execution permission, not by prompt**
  (claude: `--disallowedTools`, codex: sandbox network policy, opencode: permission config).
- Citation markers like `[A-01]` are extracted from each speech; unknown IDs, over-length
  speeches, and any web-tool usage are surfaced as **formal-check warnings**.
- Judges vote **independently** (structured JSON output) and the winner is decided by
  **majority vote**; each judge's reasoning is viewable in the UI.
- After the match a commentator agent produces a **post-match review** (decisive issues,
  evidence assessment, team-operation comparison, improvement points).
- Speakers are shown as PuruPuru-PNGTuber-style avatars (blink, lip-sync, breathing); if no
  avatar assets are installed, built-in SVG characters are used instead.
- Optional **text-to-speech** via piper-plus + Tsukuyomi-chan, synced with the typewriter text.
- **Exhibition mode**: run all inference and audio synthesis up front, then watch the whole match
  with no generation waits. Finished matches can be replayed the same way at any time.

## Requirements

- Node.js 22+ and pnpm
- For real agents: the `claude` (Claude Code), `codex` (Codex CLI), and/or `opencode`
  (OpenCode) CLIs installed and authenticated
- Optional avatars: assets placed under `assets/avatars/` (PuruPuru PNGTuber folder format);
  without them, built-in SVG fallback characters are shown
- Optional TTS: PowerShell (Windows) to run the setup script; works without it (silent mode).
  `scripts/setup-tts.ps1` provisions a Japanese voice (Tsukuyomi-chan) under
  `assets/tts/models/ja/` and an English voice under `assets/tts/models/en/`; the server picks
  the voice by the match's language, and any language without a model simply plays silently.

### How the agent CLIs are used

Clone this repository onto the machine where you normally run `claude` / `codex` /
`opencode` from a terminal. The server does not call any LLM API directly — for every
speech, prep step, and verdict it spawns the selected CLI as a local subprocess (headless,
one shot per invocation) inside a per-match workspace. That means:

- Each CLI you select in the match settings must be launchable from your shell (on `PATH`)
  and already logged in / authenticated on this machine.
- Usage is billed to whatever plan or API key each CLI is configured with, per member,
  judge, and reviewer invocation.
- The `Mock` provider needs no CLI at all and is the best way to try the app first.

## Setup

```powershell
pnpm install

# Optional: download piper-plus + the Tsukuyomi-chan voice into assets/tts/
# (the app runs fine without this — audio is simply disabled)
.\scripts\setup-tts.ps1   # Windows
./scripts/setup-tts.sh     # Linux / macOS
```

## Start / Stop

On Windows:

```powershell
.\scripts\start.ps1     # or: pnpm start
.\scripts\stop.ps1      # or: pnpm stop
```

On macOS / Linux:

```bash
./scripts/start.sh
./scripts/stop.sh
```

`start` launches the API server (http://127.0.0.1:8787) and the web UI
(http://localhost:56173) in the background, writing logs and PIDs under `.run/`.
Then open **http://localhost:56173**.

## Usage

1. **Setup screen** — pick the language (JA / EN toggle, top right), enter a resolution,
   configure each team (provider, model, reasoning mode, member count, council / role-division
   mode, captain, avatar) and the judges (1 / 3 / 5), then start the match.
2. **Arena screen** — watch live: preparation → seal (hash shown) → the eight speech parts →
   judging. Click a citation chip in the speech log to jump to that evidence entry.
3. **Result screen** — winner, each judge's vote and reasoning, and the post-match review.

Tip: run everything with the `Mock` provider on the quick format first to see the whole flow
end to end (finishes in about 30 seconds, no CLI or API cost).

## Project layout

```
shared/   Types, format definitions, citation extraction
server/   Hono API + SSE, match runner, agent adapters, sealing/hashing, TTS
web/      React SPA (paper-craft UI; swappable via assets/ui/*.png)
assets/   Avatars, TTS, UI images (git-ignored; provisioned by scripts/)
data/     Per-match artifacts (config, handouts, seals, logs, audio, verdicts, review)
```

## UI assets (paper-craft theme)

The UI is designed around paper-craft artwork. Every graphic loads from
`assets/ui/<slot>.png`; if the file is missing, an inline SVG fallback is drawn in the same
spot. So you can generate images and drop them into `assets/ui/` to restyle the app with no
code changes. Add a new slot by placing an `<Art name="..." fallback={...} />` in
`web/src/art/`.

Current slots (all transparent PNG, ~2× display size recommended):

| Slot                                  | Content                                            |
| ------------------------------------- | -------------------------------------------------- |
| `stage-backdrop`                      | Stage background (paper sky, distant town, floor)  |
| `curtain-left` / `curtain-right`      | Stage curtains                                     |
| `bunting`                             | Triangle-flag garland                              |
| `vs-medallion`                        | Hanging "VS" medallion                             |
| `topic-board`                         | Board that shows the resolution (no text baked in) |
| `podium-aff` / `podium-neg`           | Podiums (green / red)                              |
| `nameplate`                           | Speaker nameplate (no text baked in)               |
| `mic`                                 | Paper microphone                                   |
| `speech-sign-aff` / `speech-sign-neg` | Speech-bubble signs (no text baked in)             |
| `audience`                            | Row of audience silhouettes                        |
| `tree-1` / `tree-2`                   | Decorative paper trees                             |
| `prep-envelope-aff` / `prep-envelope-neg` | Sealed prep envelopes                         |
| `magnifier`                           | Magnifier (research animation)                     |
| `seal-stamp`                          | "Sealed" stamp                                     |
| `gavel`                               | Judge's gavel                                      |
| `trophy`                              | Winner trophy                                      |
| `confetti`                            | Confetti                                           |

## Testing

```powershell
pnpm test        # server unit tests (sealing/hashing, formal checks)
pnpm typecheck   # type-check all packages
pnpm --filter @debate-koshien/server exec tsx scripts/smoke.ts   # real CLI adapter reachability
```

## Notes

- Codex runs with the user's `~/.codex/config.toml` ignored (its MCP servers can block on
  auth in headless mode and stall the match). Pass model and reasoning mode explicitly in the
  match settings.
- Avatar images and the Tsukuyomi-chan voice you provision locally have their own licenses /
  usage terms. Local use is fine, but check them before publishing recordings.

## License & credits

The application code is MIT licensed (see [LICENSE](LICENSE)). Avatar images and voice models
are **not** covered by the MIT license and are governed by their own terms (see the notices
shipped alongside those assets).

This project builds on:

- [PuruPuruPNGTuber](https://github.com/rotejin/PuruPuruPNGTuber) (Apache-2.0) — the avatar
  folder format and rendering behavior (blink / lip-sync / breathing) follow this project.
  Its demo avatar assets are governed by their own asset license (see `ASSET_LICENSE.md` in
  that repository).
- [piper-plus](https://github.com/ayutaz/piper-plus) (MIT) — the text-to-speech engine
  downloaded by `scripts/setup-tts.ps1` / `scripts/setup-tts.sh`. The Tsukuyomi-chan voice
  model it fetches has its own usage terms.
