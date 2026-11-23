import { describe, expect, it } from 'vitest'
import { askWhat, closingQuestion, describeTool, notificationKind, relPath } from '../shared/hookstate'

describe('relPath', () => {
  it('writes a file from the session folder when it is inside it, whatever the slashes or case', () => {
    expect(relPath('C:\\Work\\app', 'c:\\work\\app\\src\\a.ts')).toBe('src/a.ts')
    expect(relPath('/home/me/app/', '/home/me/app/src/a.ts')).toBe('src/a.ts')
    expect(relPath('/home/me/app', '/home/me/other/a.ts')).toBe('/home/me/other/a.ts')
  })
})

describe('describeTool', () => {
  it('names the file being created or edited', () => {
    expect(describeTool('/w/app', { name: 'Write', input: { file_path: '/w/app/src/new.ts' } })).toEqual({ what: 'Permission: create new.ts', action: 'Create file src/new.ts' })
    expect(describeTool('/w/app', { name: 'Edit', input: { file_path: '/w/app/src/a.ts' } })).toEqual({ what: 'Permission: edit a.ts', action: 'Edit file src/a.ts' })
    expect(describeTool('/w/app', { name: 'NotebookEdit', input: { notebook_path: '/w/app/n.ipynb' } }).what).toBe('Permission: edit n.ipynb')
  })

  it('names the command for Bash and PowerShell alike, first line only', () => {
    expect(describeTool('/w', { name: 'Bash', input: { command: 'npm test\necho done' } })).toEqual({ what: 'Permission: run npm test', action: 'Run npm test' })
    expect(describeTool('/w', { name: 'PowerShell', input: { command: 'Get-ChildItem' } })).toEqual({ what: 'Permission: run Get-ChildItem', action: 'Run Get-ChildItem' })
  })

  it('falls back to the tool name, or to a plain line when the tool is not known', () => {
    expect(describeTool('/w', { name: 'WebFetch', input: {} })).toEqual({ what: 'Permission: WebFetch', action: 'WebFetch' })
    expect(describeTool('/w', undefined).what).toBe('Permission needed')
  })
})

describe('askWhat', () => {
  it('shows the question Claude asks, and how many more come with it', () => {
    expect(askWhat('AskUserQuestion', { questions: [{ question: 'Which  database\nshould I use?' }] })).toBe('Question: Which database should I use?')
    expect(askWhat('AskUserQuestion', { questions: [{ question: 'A?' }, { question: 'B?' }, { question: 'C?' }] })).toBe('Question: A? (+2 more)')
    expect(askWhat('AskUserQuestion', {})).toBe('Waiting for your answer')
  })

  it('knows a plan waiting for approval, and nothing else', () => {
    expect(askWhat('ExitPlanMode', { plan: '# Plan' })).toBe('Plan ready for your approval')
    expect(askWhat('Bash', { command: 'ls' })).toBe('')
    expect(askWhat('', undefined)).toBe('')
  })
})

describe('notificationKind', () => {
  it('reads the notification type when Claude Code sends one', () => {
    expect(notificationKind({ notification_type: 'permission_prompt', message: 'x' })).toBe('permission')
    expect(notificationKind({ notification_type: 'idle_prompt' })).toBe('input')
    expect(notificationKind({ notification_type: 'agent_needs_input' })).toBe('input')
    expect(notificationKind({ notification_type: 'elicitation_dialog' })).toBe('input')
  })

  it('ignores types that ask nothing of the user, even when the message mentions permission', () => {
    expect(notificationKind({ notification_type: 'auth_success', message: 'permission granted' })).toBe('')
    expect(notificationKind({ notification_type: 'agent_completed' })).toBe('')
    expect(notificationKind({ notification_type: 'elicitation_complete' })).toBe('')
    expect(notificationKind({ notification_type: 'elicitation_response' })).toBe('')
  })

  it('falls back to the message for versions that send no type', () => {
    expect(notificationKind({ message: 'Claude needs your permission to use Bash' })).toBe('permission')
    expect(notificationKind({ message: 'Claude is waiting for your input' })).toBe('input')
  })
})

describe('closingQuestion', () => {
  it('picks the question a message ends on', () => {
    expect(closingQuestion('I updated the file. Should I run the tests?')).toBe('Should I run the tests?')
    expect(closingQuestion('Ready?\n')).toBe('Ready?')
  })

  it('is empty when the message does not end with a question', () => {
    expect(closingQuestion('Is this right? I went ahead anyway.')).toBe('')
    expect(closingQuestion('')).toBe('')
  })
})
