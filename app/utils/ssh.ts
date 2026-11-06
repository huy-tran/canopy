import type { DropdownMenuItem } from '@nuxt/ui'
import type { SshHost } from '#shared/types'
import { hueOf } from '#shared/color'

/** "user@host:port" for a connection, as shown beside its name. */
export function sshDetail(h: SshHost): string {
  return `${h.user ? `${h.user}@` : ''}${h.host || '?'}${h.port && h.port !== 22 ? `:${h.port}` : ''}`
}

/** Connections by group: ungrouped first, then each group A to Z, every list sorted by name. */
export function sshGroups(hosts: SshHost[]): { group: string; hosts: SshHost[] }[] {
  const by = new Map<string, SshHost[]>()
  for (const h of hosts) {
    const g = (h.group || '').trim()
    by.set(g, [...(by.get(g) || []), h])
  }
  return [...by.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([group, list]) => ({ group, hosts: [...list].sort((a, b) => a.name.localeCompare(b.name)) }))
}

/** A dropdown menu of connections: ungrouped ones first, then a submenu per group. */
export function sshMenu(hosts: SshHost[], pick: (h: SshHost) => void): DropdownMenuItem[] {
  const item = (h: SshHost): DropdownMenuItem => ({ label: h.name, icon: 'i-hugeicons-computer-terminal-01', onSelect: () => pick(h) })
  const out: DropdownMenuItem[] = []
  for (const g of sshGroups(hosts)) {
    if (!g.group) out.push(...g.hosts.map(item))
    else out.push({ label: g.group, icon: 'i-hugeicons-folder-01', children: g.hosts.map(item) })
  }
  return out
}

/** Name for lists and the command palette: "Group / name". */
export function sshTitle(h: SshHost): string {
  return h.group ? `${h.group} / ${h.name}` : h.name
}

/** A group's colour, from a checksum of its name like a project's: the same group is always the same hue. Null for no group. */
export function groupHue(group?: string): number | null {
  const g = (group || '').trim()
  return g ? hueOf(g) : null
}

/** A profile's colour, which is its group's. */
export const sshHue = (h: { group?: string }) => groupHue(h.group)
