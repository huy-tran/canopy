// One-shot, non-interactive Claude Code runs (`claude -p`) for short writing jobs: daily recaps and commit messages.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { cleanEnv } from './pty'

/** Runs from its own folder so these runs don't show up as sessions in any project's history. */
function workDir() {
  const d = path.join(app.getPath('userData'), 'claude-jobs')
  fs.mkdirSync(d, { recursive: true })
  return d
}

export function runClaude(prompt: string, o: { model?: string; timeoutMs?: number } = {}): Promise<{ ok: boolean; text: string; error?: string }> {
  return new Promise((resolve) => {
    const args = ['-p', '--output-format', 'text', '--model', o.model || 'haiku']
    const child = spawn('claude', args, { cwd: workDir(), env: cleanEnv(), shell: true, windowsHide: true })
    let out = '', err = ''
    const timer = setTimeout(() => {
      child.kill()
      resolve({ ok: false, text: '', error: 'Claude took too long to answer.' })
    }, o.timeoutMs ?? 120_000)
    child.stdout.on('data', (d) => { out += d })
    child.stderr.on('data', (d) => { err += d })
    child.on('error', (e) => {
      clearTimeout(timer)
      resolve({ ok: false, text: '', error: e.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0 && out.trim()) resolve({ ok: true, text: out.trim() })
      else resolve({ ok: false, text: '', error: (err || out).trim() || `claude exited with code ${code}` })
    })
    // The prompt goes in on stdin: command lines on Windows are too short for diffs and transcripts.
    child.stdin.end(prompt)
  })
}
