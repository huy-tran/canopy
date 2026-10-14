// The form for running a workflow by hand: what it starts with, what survives a change of branch, and what is sent.
import type { GhWorkflowInput } from '#shared/types'

/** What an input starts at: its default, else false for a boolean or the first choice. */
function startValue(i: GhWorkflowInput): string {
  return i.default || (i.type === 'boolean' ? 'false' : i.options[0] || '')
}

export function startValues(inputs: GhWorkflowInput[]): Record<string, string> {
  return Object.fromEntries(inputs.map(i => [i.name, startValue(i)]))
}

/** The form after the branch changed and so maybe the inputs: those still asked for keep what was typed, new ones start at their default. */
export function carryValues(inputs: GhWorkflowInput[], old: Record<string, string>): Record<string, string> {
  return Object.fromEntries(inputs.map((i) => {
    const kept = old[i.name]
    const fits = kept !== undefined && (!i.options.length || i.options.includes(kept))
    return [i.name, fits ? kept : startValue(i)]
  }))
}

/**
 * What to send. An input left empty is left out, so the workflow applies its own default and GitHub is not
 * handed "" for a choice, a number or an environment, which it refuses. Only text is sent empty, as GitHub's own form does.
 */
export function sendValues(inputs: GhWorkflowInput[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of inputs) {
    const v = values[i.name] ?? ''
    if (v === '' && i.type !== 'string') continue
    out[i.name] = v
  }
  return out
}
