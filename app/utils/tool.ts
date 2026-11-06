// Which window this page is: the main one, or the GitHub, AWS or SSH window (loaded with ?win=gh|aws|ssh).
import { TOOL_KINDS, type ToolKind } from '#shared/bridge'

export const toolKind: ToolKind | null = (() => {
  if (typeof location === 'undefined') return null
  const k = new URLSearchParams(location.search).get('win')
  return TOOL_KINDS.find(t => t === k) ?? null
})()
