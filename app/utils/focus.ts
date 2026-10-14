// Which session of a project is the active one. Kept free of the stores so it can be tested on its own.
import type { Session } from '#shared/types'

/** The active pane: the one the project last had focused if it is still a pane, else the first pane. */
export function pickFocused(panes: Pick<Session, 'id'>[], stored: string | null | undefined): string | null {
  const f = panes.find(s => s.id === stored) || panes[0]
  return f ? f.id : null
}

/** Docked shells live in the dock panel, not among the panes, so they never take the active session. An unknown id (null or undefined) is let through. */
export function canFocus(s: Pick<Session, 'docked'> | null | undefined): boolean {
  return !s?.docked
}
