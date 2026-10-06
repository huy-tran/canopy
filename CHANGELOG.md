# Changelog

All notable changes to Canopy are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

- Ctrl Tab and Ctrl Shift Tab step through every open session in sidebar order, moving on to the next project's sessions and skipping projects with none.
- Sidebar: projects without sessions stay collapsed, and each project with open sessions shows how many it has.

## [0.5.0] - 2026-10-06

- The sidebar no longer collapses into an icon rail. The Ctrl Shift B shortcut and the "Collapse or expand sidebar" command are gone.
- Projects no longer have initials. The Initials field is removed from the project form.

## [0.4.0] - 2026-10-06

- 16 project colors to choose from, up from 8.
- Sidebar: project rows are tinted with the project's color and show the name in that color, in place of the initials badge. The collapsed sidebar still shows initials.
- The shell panel stays open or hidden per project, and is restored after restarting the app.

## [0.3.0] - 2026-10-06

- Shell panel shortcuts, while a shell in the panel has focus: Ctrl T opens a new tab with your default shell, Ctrl Shift T lets you pick which shell, and Ctrl Alt Right / Left move between shell tabs. Change them in Settings > Keys.
- File explorer: drag the divider to resize the file tree, drag the edges or corners to resize the window, and maximize it with the button in the header or by double-clicking the header.
- File explorer: wrap long lines in the file and diff view with the wrap button or Alt Z.
- The explorer remembers its size, tree width and wrapping between openings.
- Sidebar: project rows show when the project was last active instead of today's cost.
- Sidebar: hover a project name that is cut off to see it in full.

## [0.2.1] - 2026-10-06

- Ctrl Tab and Ctrl Shift Tab switch to the next and previous project, in sidebar order. Alt ] and Alt [ still switch between sessions in a project.
- The About window shows just the version number.

## [0.2.0] - 2026-10-06

- Star projects to keep them in a Starred section at the top of the sidebar. Use the star on a project row, or right-click and pick Star.
- Drag projects to reorder them in the sidebar or the collapsed icon rail. Dragging a project between Starred and Projects stars or unstars it.
- Alt 1-9 and the command palette follow the sidebar order, starred projects first.
- Terminals draw with WebGL, which roughly halves the window's CPU use while Claude streams output.
- New installs keep 5,000 lines of scrollback per terminal instead of 10,000, to save memory. Change it in Settings > Terminal.

## [0.1.4] - 2026-10-05

- A global shortcut (Alt Space by default) shows or hides Canopy from any app. Change it or turn it off in Settings > Keys.

## [0.1.3] - 2026-10-05

- Daily summary: recaps and timesheet hours from the last 7 days are kept when Canopy restarts.

## [0.1.2] - 2026-10-05

- The update window now shows the Canopy logo.

## [0.1.1] - 2026-10-05

- Daily summary: an Hours field under the recap for your timesheet, with the measured active time and Claude's estimate of how long the work would take.

## [0.1.0] - 2026-10-05

First release.

- Run many Claude Code sessions side by side, grouped by project, in tabs, splits or a grid.
- See at a glance which sessions are working, waiting on you or done, with an inbox and desktop notifications.
- Answer Claude's permission prompts (Yes, Always, No) from the inbox, the sidebar or the notification itself.
- Track tokens, cost, model and context per session, plus plan usage limits in the status bar.
- Project overview with cost and activity history.
- Daily summary per project: sessions, prompts, files changed and commits, with an optional written recap.
- Plain shells next to Claude sessions, docked at the bottom or on the right.
- Dev servers per repo, with logs in the dock panel.
- File and git explorer with diffs, staging, commits (with a Claude-drafted message), push and pull request links.
- Worktrees: start a session in a new worktree and merge it back when done.
- Open sessions and shells come back after a restart.
- Command palette, rebindable shortcuts, light and dark themes, font and terminal settings.
- Automatic updates from GitHub releases.

[0.3.0]: https://github.com/huy-tran/canopy/releases/tag/v0.3.0
[0.2.1]: https://github.com/huy-tran/canopy/releases/tag/v0.2.1
[0.2.0]: https://github.com/huy-tran/canopy/releases/tag/v0.2.0
[0.1.4]: https://github.com/huy-tran/canopy/releases/tag/v0.1.4
[0.1.3]: https://github.com/huy-tran/canopy/releases/tag/v0.1.3
[0.1.2]: https://github.com/huy-tran/canopy/releases/tag/v0.1.2
[0.1.1]: https://github.com/huy-tran/canopy/releases/tag/v0.1.1
[0.1.0]: https://github.com/huy-tran/canopy/releases/tag/v0.1.0
