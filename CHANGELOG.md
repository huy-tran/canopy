# Changelog

All notable changes to Canopy are listed here. Versions follow [Semantic Versioning](https://semver.org/).

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

[0.2.0]: https://github.com/huy-tran/canopy/releases/tag/v0.2.0
[0.1.4]: https://github.com/huy-tran/canopy/releases/tag/v0.1.4
[0.1.3]: https://github.com/huy-tran/canopy/releases/tag/v0.1.3
[0.1.2]: https://github.com/huy-tran/canopy/releases/tag/v0.1.2
[0.1.1]: https://github.com/huy-tran/canopy/releases/tag/v0.1.1
[0.1.0]: https://github.com/huy-tran/canopy/releases/tag/v0.1.0
