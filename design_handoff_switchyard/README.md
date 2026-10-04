# Handoff: Switchyard — multi-project Claude Code workspace

## Overview
Switchyard is a Windows-first desktop app (Electron) for a freelance developer who runs many Claude Code sessions across many client projects. It groups real terminals (running the `claude` CLI) by project, shows which session is waiting for input, tracks token cost and plan usage, and adds dev servers, a file/git explorer, worktrees, an inbox for waiting sessions, settings with rebindable shortcuts, and an app menu.

**Build exactly what is in the prototype. Do not add features, screens, settings or menu items that are not in `Switchyard Prototype.dc.html`.** Where the prototype fakes something (Claude output, git data, logs, updates), replace the fake with the real data source named in "Real integrations"; do not change the UI or behavior around it.

## Tech stack (required)
- **Electron + Nuxt 3 (SPA mode) + Nuxt UI v3.** Use Nuxt UI components **as much as possible**. Only hand-build a component when Nuxt UI has no equivalent (terminal, cost chart, code diff view). Theme Nuxt UI via `app.config.ts` / CSS variables to match the tokens below rather than overriding component internals.
- Terminals: **xterm.js** (+ fit and web-links addons) in the renderer, **node-pty** in the main process. Default font `JetBrainsMono Nerd Font`.
- State: Pinia. Persist projects, prefs, keybindings and per-project layout with `electron-store` (or similar).
- Keyboard: Nuxt UI `defineShortcuts`, with its config generated from the user's keybinding store, so shortcuts can be rebound at runtime.

### Nuxt UI component map
| Prototype element | Nuxt UI |
|---|---|
| App shell, sidebar, main panel | `UDashboardGroup`, `UDashboardSidebar` (collapsible → icon rail), `UDashboardPanel` |
| Project rows (expand to sessions) | `UCollapsible` (or `UTree`) inside sidebar; project initials as `UAvatar` (square) |
| Waiting count / status pills | `UBadge`, `UChip` (dot on rail icons) |
| All buttons | `UButton` (variants: solid = primary white, outline, ghost, link) |
| Segmented controls (Terminals/Overview, layout, Diff/File, ranges, theme, editor) | `UTabs` (pill variant) or a button group of `UButton`s |
| Jump palette (Ctrl Shift P) and Command palette (Ctrl Shift A) | `UCommandPalette` inside `UModal` |
| App menu, “+ Session” menu | `UDropdownMenu` |
| Project right-click menu | `UContextMenu` |
| Add/Edit project, Session details, Settings, About, Updates, File explorer, Keyboard help | `UModal` |
| Forms | `UForm`, `UFormField`, `UInput`, `UCheckbox`, `USwitch` |
| Font picker, editor picker | `USelectMenu` (searchable, custom items with preview, `create-item` for custom names) |
| Add dev server popover | `UPopover` |
| Plan usage bars, download progress, context bar | `UProgress` |
| In-app notifications | `UToast` (`useToast`) — real Windows notifications via Electron `Notification` |
| Tooltips (`title=` in prototype) | `UTooltip` |
| Key caps | `UKbd` |
| File tree in explorer | `UTree` |
| Overview session table | `UTable` |
| Settings left nav | `UNavigationMenu` (vertical) |
| Image lightbox | `UModal` (fullscreen) or `UCarousel` |
| Not in Nuxt UI → custom | xterm terminal pane, cost-per-day stacked bar chart (simple CSS/SVG bars as in prototype), diff/code viewer with syntax highlighting (use Shiki) |

## About the design files
The HTML files are **design references**, not production code. Open `Switchyard Prototype.dc.html` in a browser (keep `support.js` next to it). It is a fully clickable prototype with simulated Claude sessions. `Switchyard.dc.html` contains the earlier static mockups and the original navigation/keyboard notes. Recreate the behavior in Nuxt/Electron; do not ship the HTML.

## Fidelity
**High fidelity.** Match colors, type, spacing, density and copy. Exact copy strings are in the prototype source; use them verbatim.

## Layout (main window)
Top to bottom: title bar 34px → body (sidebar + main) → status bar 28px.

- **Title bar** (`--chrome` bg, 1px bottom border): app-menu button (logo + "Switchyard" + ▾; blue dot when an update is ready), centered search box (max 400px, "Jump to project or session…" + current Jump shortcut), "Commands" button + shortcut, Windows min/max/close (46×34; close hover `#C42B1C`).
- **Sidebar 248px** (collapses to 52px icon rail below 900px window width or via Ctrl Shift B):
  - "Waiting on you" section (only when ≥1 waiting): header with "Open inbox" link + amber count; rows = project color square, short project name, repo chip, what it's waiting for, waiting time. Click → jumps to session.
  - "Projects" list: chevron, initials avatar (16px, radius 4), name, amber count pill if waiting, today's cost (if enabled). A project with a waiting session gets an amber-tinted row and amber name (configurable: highlight+count / highlight / count). Expanded rows list sessions: status dot, repo chip, ⑂ if worktree, title (last prompt), relative time.
  - Footer: "+ New project" with shortcut, collapse «.
  - Icon rail: amber waiting count at top (click = next waiting), project avatars 30px with left selection bar and amber dot; hover shows a flyout with that project's sessions.
- **Main**: project header 40px (color square, name, Terminals/Overview segment, spacer, layout segment tabs/split/grid, "Prompt all" (≥2 sessions), "+ Session" menu, "Files", "Edit").
  - Inbox bar (when inbox on), Dev servers bar 30px, tabs row (tabs layout), Prompt-all bar, panes, logs panel 230px.
- **Status bar**: 5-hour and weekly plan bars (96px, green <50%, amber <80%, red ≥80%) with % and reset time, working/waiting/done counts, "Today $x", theme toggle, keyboard-shortcuts button.

## Terminal pane
- Header 32px (split/grid only): status dot, repo chip, title, "Share → FE" (when this session changed files and another repo has a session), "Needs permission"/"Needs input" amber badge, branch chip (violet), cost chip (outlined), i (details), ✕. Pane border tinted by status; focused pane stronger.
- Body = real xterm. Below it the prototype shows Claude's own input box and status line; in the real app those come from the CLI itself. The **chip status line** under each terminal is app-rendered: folder chip (project-color tint), "⑂ worktree" (teal), branch (violet), "±N changed" (amber, opens explorer on Changes), model (cyan), ctx mini-bar (green/amber/red), cost (outlined).
- `[Image #n]` and `@path` in the terminal are highlighted (xterm link provider); hover an image link → preview popover; click → lightbox.
- **Screenshot strip** under the terminal when the session has images: "Images" label, segment "Last prompt · N" / "Session · N", Hide ▾; thumbnails 104×62 (78×48 in narrow panes), `#n` label, "pending" tag + ✕ remove for images attached to the unsent prompt (removing renumbers later pending images and updates `[Image #n]` text), "+" tile. Clipboard paste of an image into a pane attaches it.

## Screens and overlays (all in the prototype)
1. **Overview** (per project): three period cards (Today / This week / All time: cost, tokens, sessions, per-repo split bar + legend); "Cost per day" stacked bars with 14d/30d/90d and hover readout; "By repo" this week; Sessions table (Status, Repo, Session, Branch, Started, Duration, In, Out, Cache r/w, Cost) with repo filter; click a live row → open terminal. Note text: costs are API-equivalent estimates.
2. **Add / Edit project** modal: name (validated, unique), initials, 8 color swatches, repos (drag to reorder = pane order; label, folder path + Browse, startup command default from prefs, git/stack check line, dev servers list with command + port), "Start all sessions when I open this project", "Start dev servers with the sessions", "Resume with claude --continue", editor (VS Code / Cursor / PhpStorm / Zed), delete with confirm, Save (Ctrl Enter).
3. **Session details** modal: status, project · repo, title, model, branch, started, duration, folder, command, session id, tokens (in/out/cache read/write), context bar, Open in editor, Open folder, Copy session ID, worktree block with "Merge into <base>", recent prompts.
4. **File explorer** modal (Ctrl Shift F): repo switch, branch, worktree chip, summary; fuzzy search with highlighted matches; tabs Changes (M/A badges, +/−, staged tag, "this session"/"other session", "Only files changed in this session") and Files (tree with indent guides, change dots); preview pane Diff/File with syntax highlighting; actions Copy path (Ctrl Alt C), Show in Explorer, Mention in prompt (Ctrl I → inserts `@path`), Open in editor (Enter). Tab switches tabs, ← → folders.
5. **Command palettes**: Ctrl Shift P = projects + sessions only (waiting first). Ctrl Shift A = commands only (exact list in `paletteView`).
6. **Prompt all** bar: tick sessions, one input, Enter sends to all ticked.
7. **Inbox** (Ctrl Shift I): shows one waiting session at a time; after it's answered, auto-advances to the next oldest after ~1.2s; Skip, Exit; "All caught up" state.
8. **Dev servers**: bar chips (dot, repo, command, `:port ↗`, ▶/■), "+ Add" popover (repo switch, stack-specific suggestions incl. reverb:start, horizon, schedule:work, pail, Vite; command + port; Add / Add and start), Start all/Stop all, Logs. Logs panel: tab per server, status, Open ↗, Start/Stop, Restart, Remove, Clear, ✕.
9. **Worktrees**: "+ Session" menu per repo offers "Same folder" / "⑂ New worktree" (worktree suggested when the folder already has a session). Ctrl Shift T picks worktree automatically in that case.
10. **App menu**: New project, Command palette, Settings, Keyboard shortcuts, Theme (Dark/Light/System), Check for updates (or "Downloading… %" / "Restart to update"), Release notes, Report an issue, About, Quit.
11. **Settings** modal: General, Appearance, Terminal (font `USelectMenu` with Nerd Font group + preview, size 11–14, cursor, scrollback), Notifications, Keyboard shortcuts (search; click to record; + adds another; per-action Reset; Reset all; conflict message "Use it here"; reserved Claude keys rejected: Ctrl C, Ctrl R, Ctrl V, Ctrl O, Ctrl T, Ctrl B, Ctrl D, Ctrl L, Shift Tab, Esc; keys without Ctrl/Alt rejected; built-in Alt 1–9, Esc, 1/2/3 shown locked).
12. **About** and **Updates** modals (checking → available → downloading → ready → restart).
13. **Notifications**: on Stop/Notification hooks for sessions you are not viewing; click jumps to the session; respects prefs (needs input, finished, skip viewed, sound, do not disturb).

## Keyboard (defaults; all rebindable except built-ins)
Defaults are in `ACTIONS` in the prototype source. Copy that list exactly, including labels and groups. Alt Shift works as a fallback for Ctrl Shift in the browser only; Electron doesn't need it.

## State (Pinia stores)
`projects` (id, name, initials, hue, repos[{id,label,path,cmd,stack,branch,services[{id,cmd,port}]}], layout, view, focusId, autoStart, autoServices, resume, editor), `sessions` (id, pid, repoId, title, status working|waiting|done|idle, branch, wt{path,base}|null, model, ctx, tokens in/out/cacheR/cacheW, images[], started, waitingSince), `services` runtime (status, log), `prefs`, `keys` (overrides only), UI state (sel, theme, sidebar, palette, modal, explorer, inbox, bc, settings, upd, toasts).

## Real integrations (replace the prototype's fakes, keep the UI)
- Session status: Claude Code **hooks** (UserPromptSubmit → working, Notification → waiting, Stop → done) posting to the app over a local socket/IPC.
- Tokens, cost, model, ctx: Claude Code session JSONL logs; cost = API-equivalent pricing.
- Plan usage bars: from Claude usage data available to the CLI.
- Git changes, diffs, worktrees, merge: `git status --porcelain`, `git diff`, `git worktree add/remove`, `git merge`.
- File tree / fuzzy search: real repo files (respect .gitignore).
- Dev servers: spawn with node-pty/child_process; stream real stdout.
- Editor / Explorer / browser: `code`/`cursor`/`phpstorm`/`zed` CLI, `shell.showItemInFolder`, `shell.openExternal`.
- Updates: `electron-updater`. Fonts: list installed fonts (e.g. `font-list`).

## Design tokens (dark; light overrides in `THEMES.light` in source)
bg `#0F1012` · chrome `#131417` · head `#111214` · terminal `#0B0C0E` · line `#222429` / `#1F2125` · hover `#1B1D21` · selected `#1E2024` · chip `#1F2126` · text `#E4E5E8` / `#C7CAD1` / `#A3A7B0` · muted `#8B8F98` / `#6E727B` · modal `#17181B`
Status: working `oklch(0.72 0.12 250)` · waiting `oklch(0.80 0.13 80)` · done `oklch(0.75 0.12 155)` · idle `#5A5E66` · error `oklch(0.70 0.14 25)` · link `oklch(0.78 0.10 250)`
Chips: violet `oklch(0.78 0.10 300)` · cyan `oklch(0.80 0.08 210)` · teal `oklch(0.78 0.10 175)` · chip backgrounds = color at 14–16% via color-mix.
Project colors: `oklch(0.72 0.12 H)` for H in 45, 80, 140, 185, 230, 295, 345, 20.
Syntax: `--syn-*` variables in source (kw, str, num, com italic, fn, var, ty, tag, at, pr).
Type: UI `Geist` 11–15px (labels 10.5px uppercase 0.07em); mono `JetBrainsMono Nerd Font` 10–12.5px. Radius: 3–4 chips, 5 buttons/inputs, 6–8 cards/menus, 10 modals. Shadow: `0 18px 50px rgba(0,0,0,0.55)`.

## Out of scope
Anything not in the prototype — including plain shell terminals (only proposed, not designed), SSH/remote, team sharing, keeping sessions alive after quit.

## Files
- `Switchyard Prototype.dc.html` — interactive prototype (source of truth; logic class holds all data, copy and behavior).
- `Switchyard.dc.html` — earlier static mockups + navigation notes.
- `support.js` — runtime needed to open the HTML files locally.
