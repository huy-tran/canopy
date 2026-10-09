# Changelog

All notable changes to Canopy are listed here. Versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.18.0] - 2026-10-09

- GitHub has its own window, built on the GitHub CLI, so nothing else needs installing. Open or close it with Ctrl Shift G over the terminals or the 3D World, where it is see-through, or close it with a click outside. It replaces the GitHub view that ran gh-tui, along with the "GitHub terminal app" setting.
  - Review requests: the pull requests waiting for your review, longest-waiting first.
  - My pull requests: the ones you opened.
  - Repos: every repo you can reach, the 30 most recently pushed first, with a search across all of them by name, owner or description. Open one to see its open pull requests, this week's workflow runs and its Dependabot alerts, or copy its clone command.
  - A pull request's page: its description, reviewers and comments, a highlighted diff file by file, and its checks. Approve, request changes or comment, and merge by merge commit, squash or rebase, optionally deleting the branch.
  - Workflows: runs from the last week, running ones first. Open one to see its jobs, steps and log, then re-run it, re-run the failed jobs, or cancel it. Scheduled runs are hidden unless you ask for them.
  - Security: open Dependabot alerts by repo and severity, each with the version that fixes it.
  - Run a workflow from a repo: pick one of its workflows that can be run by hand, then the branch and its inputs.
- The GitHub window works from the keyboard, like gh-tui. In the sidebar, Up and Down pick a section and Enter or Right goes into it. In a section, Up and Down (or J and K) move, Enter or Right opens, and Esc or Left goes back, then out to the sidebar. Esc never closes the window: Ctrl Shift G or a click outside does. / searches repos and O opens in the browser. On a pull request, Tab switches between overview, files and checks, A approves, X requests changes, C comments, S, M and R squash, merge or rebase (after asking), and D toggles deleting the branch. W runs a workflow, and on a run Shift R re-runs it, Shift F re-runs the failed jobs and Shift X cancels it. The footer shows the keys for where you are, and all of them can be changed in Settings > Keyboard shortcuts.
- Clicking a review request notification opens that pull request in the GitHub window.
- GitHub is read sparingly. The GitHub window and GitHub HQ share one read, which pauses while Canopy is minimised or in the tray, and runs in progress are followed by reading only their repos. The last read is saved, so both fill in at once on launch. If fewer than 500 GitHub API calls are left in the hour, Canopy reads much less until it resets and says so in the GitHub window and on GitHub HQ's sign.
- The 3D World has a GitHub HQ next to the office, with two rooms and a staff of octocats. Pull requests is a mailroom with a parcel for each open PR, coloured by its review. The ones waiting for your review sit on the counter, with their authors queueing in front and getting more impatient the longer they wait, while Mona the clerk carries parcels about and calls out who is waiting. Workflows is a factory with a production line per repo and a lamp on its machine for each workflow: its belt moves, its chimney smokes and its beacon turns while any of them runs, it turns red when one failed, and its sign shows the repo and the workflows that need a look. Scheduled runs only show while they run or after they fail. A board on the back wall lists what is running and for how long, and Octo and Inky, the foremen, go from machine to machine saying what each one is doing.
- GitHub HQ shows your Canopy projects' repos and your most active repos on GitHub. Hover over anything for its details, or click it to open it in the GitHub window: a pull request to review, a repo from its factory line, or a run from its lamp.

## [0.17.0] - 2026-10-09

- A GitHub view runs gh-tui inside Canopy: open it with the GitHub button in the title bar or Ctrl Shift G. It keeps running while closed, so it opens instantly where you left it. Its own Ctrl shortcuts, such as Ctrl K, reach it. Change the app it runs in Settings > General.
- Canopy tells you when someone requests your review on a pull request. It checks GitHub every 5 minutes, shows how many reviews are waiting on the GitHub button, and reminds you every hour while any are left. Clicking a notification opens the GitHub view. Change or turn these off in Settings > Notifications.
- On a PC without gh-tui, the GitHub view shows how to install it (and the GitHub CLI, if that's missing too) in place of an error. It also finds gh-tui installed as github-tui. If the GitHub CLI is missing or signed out, Canopy says so once and marks the GitHub button.

## [0.16.0] - 2026-10-08

- The 3D World's common room has a new lineup every day: two of ping pong, foosball, pool, air hockey and a board game in the middle, and the arcade machine or darts at the front.

## [0.15.0] - 2026-10-08

- The terminal in the 3D World's session window is see-through again. In 0.14.0 only the frame around it was.
- The cards over the 3D World (a character's card, the right-click menu and a project's screen card) are see-through and blurred, like the session window.
- The weather card in the 3D World shows Celsius and km/h.
- The workspace simulation is now called the 3D World: in the title bar, the command palette, the shortcut list, the view itself and Settings.

## [0.14.0] - 2026-10-08

- The window is always solid: the Window opacity and Background effect settings are gone. Cards over the workspace simulation no longer turn see-through.
- The session window in the workspace simulation is always a little see-through, 90% by default. Set anywhere from 30% to 90% in Settings > Appearance.

## [0.13.1] - 2026-10-08

- The terminal in the workspace simulation's session window is see-through too. It stayed black in 0.13.0.

## [0.13.0] - 2026-10-08

- In the workspace simulation, Ctrl Enter opens the session of the character in view and closes it again. Change it in Settings > Keyboard shortcuts.
- The session window in the workspace simulation is see-through, so you can watch everyone moving behind the terminal. Set how solid it is in Settings > Appearance; 100% makes it solid again.
- The sidebar highlights the session of the character in view in the workspace simulation, and the project of the room.

## [0.12.1] - 2026-10-08

- In the workspace simulation, double-click a session in the sidebar to open it right there, without chasing its character.

- In the workspace simulation, Ctrl Tab and Ctrl Shift Tab fly between everyone's characters, and Alt ] and Alt [ between those in the same room, instead of leaving the view.

## [0.12.0] - 2026-10-08

- Right-click a character waiting on you to see what Claude is asking and answer it right there.
- In the workspace simulation, clicking a project in the sidebar flies to its room instead of leaving the view.
- Tab and Shift Tab fly between the sessions waiting on you, oldest first. Ctrl Shift J does the same while the workspace is open.
- A room's card has a Close all button: everyone in the room waves goodbye, then their sessions close.
- The workspace follows the time of day, from bright daylight to a dark night lit by the rooms' lamps, and the weather outside: rain, snow, fog and thunderstorms.
- Characters act out what Claude is doing: reading a book while it reads files, leaning in to run commands, fingers crossed while tests run, chin in hand on the web. They cheer when tests pass and fume when something fails.
- Set the city for the weather in Settings > General. It still defaults to the city in your time zone.
- The workspace draws fewer frames while Canopy is in the background or a session window covers it, to save battery.

## [0.11.0] - 2026-10-08

- Click a room in the workspace simulation to add a session to that project without leaving the view. With more than one repo, pick which one.
- Right-clicking a character now opens its menu. It closed straight away before.
- Clicking outside a session window in the workspace simulation closes it. Esc still goes to Claude.
- The room card has the same see-through look as the weather card, with its buttons on one line.

## [0.10.0] - 2026-10-08

- In the workspace simulation, clicking a session in the sidebar flies to its character and follows them around.
- Right-click a character to talk to them, open their session in the terminals, or close it: they wave goodbye and disappear.
- A stage in front of the common room has a rock band playing, with stage lights and a dance floor where idle sessions come to rock out.
- Idle characters no longer stay put: every so often they get up and go do something else.
- A card shows the local time and the weather outside.

## [0.9.0] - 2026-10-08

- Ctrl W closes the terminal you are in: the focused session or shell, or the shell in view in the shell panel.
- Ctrl Shift W closes every session and shell in the current project, after asking first.
- Both shortcuts can be changed in Settings > Keyboard shortcuts.

## [0.8.0] - 2026-10-08

- A 3D workspace simulation shows all your projects at once. Open it with the Workspace button in the title bar or Ctrl Shift Home.
- Each project is a room in its colour, with its name over the door. Its lights are on while it has a session open and off when it has none.
- Each Claude session is a developer or a designer with their own name, and each subagent a smaller helper beside them. New ones are summoned in a circle of light.
- People work at their desks while Claude works, wave when Claude needs you, and say what Claude is writing or doing in a speech bubble.
- Idle sessions wander off to the common room for football on the big TV, games, ping pong, foosball, the arcade or a coffee, and walk back when Claude gets busy again.
- Hover a room's big screen for that project's overview: spend today, this week and all time, the last 14 days, and who is in the room.
- Click someone to open their session in a window over the workspace and work with Claude without leaving it.

## [0.7.0] - 2026-10-07

- 11 coding fonts come with Canopy for the terminal: JetBrains Mono, Cascadia Code, Fira Code, Geist Mono, IBM Plex Mono, Source Code Pro, Roboto Mono, Ubuntu Mono, Inconsolata, Victor Mono and Red Hat Mono. Pick them in Settings > Terminal without installing anything.
- Status line icons show with every terminal font, not just Nerd Fonts.
- The default terminal font is now JetBrains Mono. A font you already picked is kept.
- Settings > Terminal has many more ways to tune the look: font sizes from 10 to 16, line height, letter spacing, font weight for normal and bold text, text brightness, boost contrast, bright colours for bold text and a blinking cursor switch. A Reset link puts them back to the defaults.

## [0.6.0] - 2026-10-06

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

[0.18.0]: https://github.com/huy-tran/canopy/releases/tag/v0.18.0
[0.17.0]: https://github.com/huy-tran/canopy/releases/tag/v0.17.0
[0.16.0]: https://github.com/huy-tran/canopy/releases/tag/v0.16.0
[0.15.0]: https://github.com/huy-tran/canopy/releases/tag/v0.15.0
[0.14.0]: https://github.com/huy-tran/canopy/releases/tag/v0.14.0
[0.13.1]: https://github.com/huy-tran/canopy/releases/tag/v0.13.1
[0.13.0]: https://github.com/huy-tran/canopy/releases/tag/v0.13.0
[0.12.1]: https://github.com/huy-tran/canopy/releases/tag/v0.12.1
[0.12.0]: https://github.com/huy-tran/canopy/releases/tag/v0.12.0
[0.11.0]: https://github.com/huy-tran/canopy/releases/tag/v0.11.0
[0.10.0]: https://github.com/huy-tran/canopy/releases/tag/v0.10.0
[0.9.0]: https://github.com/huy-tran/canopy/releases/tag/v0.9.0
[0.8.0]: https://github.com/huy-tran/canopy/releases/tag/v0.8.0
[0.7.0]: https://github.com/huy-tran/canopy/releases/tag/v0.7.0
[0.6.0]: https://github.com/huy-tran/canopy/releases/tag/v0.6.0
[0.5.0]: https://github.com/huy-tran/canopy/releases/tag/v0.5.0
[0.4.0]: https://github.com/huy-tran/canopy/releases/tag/v0.4.0
[0.3.0]: https://github.com/huy-tran/canopy/releases/tag/v0.3.0
[0.2.1]: https://github.com/huy-tran/canopy/releases/tag/v0.2.1
[0.2.0]: https://github.com/huy-tran/canopy/releases/tag/v0.2.0
[0.1.4]: https://github.com/huy-tran/canopy/releases/tag/v0.1.4
[0.1.3]: https://github.com/huy-tran/canopy/releases/tag/v0.1.3
[0.1.2]: https://github.com/huy-tran/canopy/releases/tag/v0.1.2
[0.1.1]: https://github.com/huy-tran/canopy/releases/tag/v0.1.1
[0.1.0]: https://github.com/huy-tran/canopy/releases/tag/v0.1.0
