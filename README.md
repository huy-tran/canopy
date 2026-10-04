# Canopy

A Windows desktop workspace for running many Claude Code sessions across many client projects. It groups real `claude` terminals by project, shows which session is waiting on you, tracks token cost and plan usage, and adds dev servers, a file/git explorer, worktrees, an inbox, rebindable shortcuts and an app menu.

The design handoff (prototype and requirements) lives in `design_handoff_switchyard/`.

## Stack

- Electron (main process: `electron/`)
- Nuxt 4 in SPA mode with Nuxt UI v4 (renderer: `app/`)
- Pinia stores, persisted with `electron-store`
- xterm.js in the renderer, node-pty in the main process
- Shiki for diff and file highlighting

## Requirements

- Windows 10/11, Node 22.19+ or 24.11+
- Claude Code (`claude`) and `git` on your PATH
- `curl.exe` (ships with Windows 10+), used by the session hooks
- Optional: a Nerd Font such as JetBrainsMono Nerd Font for Claude's status line icons

## Commands

```bash
npm install        # npm 11 asks to approve install scripts; allowScripts in package.json covers them
npm run dev        # Nuxt dev server on :3456 plus Electron
npm run build      # nuxt generate + bundle electron/ to dist-electron/
npm run dist       # build and package a Windows installer into release/
npm run typecheck  # renderer (vue-tsc) and main process (tsc)
```

## How the real integrations work

| Feature | Source |
|---|---|
| Session status | Each terminal runs `claude --settings <file>`; the file's hooks (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`) pipe their JSON to a local HTTP server with `curl`. |
| Tokens, cost, model, context | The session's JSONL transcript under `~/.claude/projects/`, priced at API rates (`shared/pricing.ts`). |
| Overview history | All JSONL logs for the project's repo folders (and their worktrees). |
| Plan usage bars | The OAuth usage endpoint, using the credentials Claude Code stores in `~/.claude/.credentials.json`. |
| Git changes, diffs, files | `git status`, `git diff`, `git ls-files` (respects `.gitignore`). |
| Worktrees | `git worktree add` into `<repo>.worktrees\<slug>`; Merge runs `git merge` then `git worktree remove`. |
| Dev servers | node-pty, with the whole process tree killed on Stop. |
| Screenshots | A pasted image is saved to disk and its path pasted at Claude's prompt, which attaches it as `[Image #n]`. |
| Notifications, updates, fonts | Electron `Notification`, `electron-updater`, `font-list`. |

## Configuration still to fill in

- `app/app.config.ts` has empty `releaseNotesUrl` and `issuesUrl`.
- `package.json` has no `build.publish` target yet, so packaged builds report an update-check error until one is set.
- The app icon is drawn at runtime as a placeholder for the branding.
