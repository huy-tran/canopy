// What Claude Code's hook payloads say a session is waiting on, in the words the sidebar and notifications show.

/** A file path as written from the session's folder, when it is inside it. */
export function relPath(cwd: string, file: string) {
  const f = file.replace(/\\/g, '/'), c = cwd.replace(/\\/g, '/').replace(/\/$/, '')
  return f.toLowerCase().startsWith(c.toLowerCase() + '/') ? f.slice(c.length + 1) : f
}

/** "Permission: edit schema.ts" plus the longer "Edit file src/.../schema.ts" for notifications. */
export function describeTool(cwd: string, tool: { name: string; input: any } | undefined) {
  if (!tool) return { what: 'Permission needed', action: 'Permission needed' }
  const file = tool.input?.file_path || tool.input?.notebook_path
  if (file) {
    const rel = relPath(cwd, String(file)), base = rel.split('/').pop()
    const create = tool.name === 'Write'
    return { what: `Permission: ${create ? 'create' : 'edit'} ${base}`, action: `${create ? 'Create' : 'Edit'} file ${rel}` }
  }
  if (tool.name === 'Bash' || tool.name === 'PowerShell') {
    const cmd = String(tool.input?.command || '').split('\n')[0]!.slice(0, 60)
    return { what: `Permission: run ${cmd.slice(0, 30)}`, action: `Run ${cmd}` }
  }
  return { what: `Permission: ${tool.name}`, action: tool.name }
}

/** What a session waits on when Claude calls a tool that stops for the user's answer; empty for any other tool. */
export function askWhat(name: string, input: any): string {
  if (name === 'ExitPlanMode') return 'Plan ready for your approval'
  if (name !== 'AskUserQuestion') return ''
  const qs = Array.isArray(input?.questions) ? input.questions : []
  const q = String(qs[0]?.question || '').trim().replace(/\s+/g, ' ')
  if (!q) return 'Waiting for your answer'
  return 'Question: ' + q.slice(0, 80) + (qs.length > 1 ? ` (+${qs.length - 1} more)` : '')
}

/**
 * What a Notification hook asks of the user: permission for a tool, some other input, or nothing
 * (signed in, a subagent finished and the like). Older Claude Code versions send no type, only the message.
 */
export function notificationKind(p: Record<string, any>): 'permission' | 'input' | '' {
  const type = String(p.notification_type || '')
  if (type === 'permission_prompt') return 'permission'
  if (type === 'idle_prompt' || type === 'agent_needs_input') return 'input'
  if (type.startsWith('elicitation_')) return /_(complete|response)$/.test(type) ? '' : 'input'
  if (type) return ''
  return /permission/i.test(String(p.message || '')) ? 'permission' : 'input'
}

/** The question Claude ended its turn on, when its last message closes with one; empty otherwise. */
export function closingQuestion(last: string): string {
  const text = last.trim()
  if (!/\?\s*$/.test(text)) return ''
  return text.split(/(?<=[.!?])\s+/).filter(x => /\?$/.test(x)).pop() || text
}
