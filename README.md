# Canopy

A Windows and Linux (Omarchy, Arch with Hyprland) desktop workspace for running many Claude Code sessions across many client projects. It groups real `claude` terminals by project, shows which session is waiting on you, tracks token cost and plan usage, and adds dev servers, a file/git explorer, worktrees, an inbox, rebindable shortcuts and an app menu.

## Stack

- Electron (main process: `electron/`)
- Nuxt 4 in SPA mode with Nuxt UI v4 (renderer: `app/`)
- Pinia stores, persisted with `electron-store`
- xterm.js in the renderer, node-pty in the main process
- Shiki for diff and file highlighting
- The AWS SDK v3 in the main process for the AWS window

## Requirements

- Windows 10/11 or Linux (built for Omarchy; any recent Arch-based distro), Node 22.19+ or 24.11+
- Linux only: a compiler toolchain (`base-devel`) and Python, since `node-pty` has no Linux prebuilds and compiles on `npm install`
- Claude Code (`claude`) and `git` on your PATH
- `curl` (`curl.exe` ships with Windows 10+), used by the session hooks
- Optional: a Nerd Font such as JetBrainsMono Nerd Font for Claude's status line icons
- Optional: profiles in `~/.aws` for the AWS window, and the AWS CLI with the Session Manager plugin for its SSM shells and port forwards

## Commands

```bash
npm install        # npm 11 asks to approve install scripts; allowScripts in package.json covers them
npm run dev        # Nuxt dev server on :3456 plus Electron
npm run dev:demo   # the same with made-up projects and fake Claude sessions (nothing runs, nothing is saved)
npm run build      # nuxt generate + bundle electron/ to dist-electron/
npm run dist       # build and package a Windows installer into release/
npm run dist:linux # build and package a Linux AppImage into release/ (run it on Linux)
npm run typecheck  # renderer (vue-tsc) and main process (tsc)
npm run sim:check  # screenshot the workspace simulation with made-up data into .sim-check/
npm run release -- minor  # release the CHANGELOG "Unreleased" notes: bump, commit, tag, push
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

## Linux (Omarchy)

- Commands run in your own shell (`$SHELL -l -i -c`), so `claude`, `mise` and `nvm` resolve as they do in a terminal. Canopy also takes that shell's `PATH` at start, for `git`, `gh`, `aws` and the editors.
- The window is frameless and the tray needs a tray host (Waybar's tray module). Closing the window hides it to the tray; with no tray host, turn that off in Settings > General, or start `canopy` again to bring the window back.
- Summon shortcut: Electron's global shortcuts are limited under Wayland. Bind a free key in Hyprland instead, since a second launch brings the window forward: `bindd = SUPER ALT, <key>, Canopy, exec, canopy` (for an AppImage, give its file path in place of `canopy`).
- Start at login: add `exec-once = canopy` to your Hyprland config.
- An AppImage may need `fuse2` on Arch.
- Updates: only the AppImage updates itself. Other installs update through whatever installed them.

## Releasing

1. Bump `version` in `package.json` and add a matching `## [x.y.z]` entry to `CHANGELOG.md`.
2. Commit, then tag and push: `git tag vx.y.z && git push origin master vx.y.z`.
3. The `Release` workflow drafts a GitHub release from the changelog entry, builds the Windows installer and the Linux AppImage in parallel, then publishes the release once both are uploaded. Installed copies pick it up as an update.

Builds are not code-signed, so Windows SmartScreen warns on first install ("More info" then "Run anyway").

On Windows, `node-pty` ships prebuilt N-API binaries that work in Electron, so packaging skips the native rebuild (`npmRebuild: false`) and needs no Visual Studio. On Linux the same N-API build is compiled once by `npm install`.

Releases carry the AppImage too; `npm run dist:linux` builds one locally.

## License

[MIT](LICENSE)
