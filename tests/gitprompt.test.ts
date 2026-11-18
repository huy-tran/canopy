import { describe, expect, it } from 'vitest'
import { failureText, promptOf } from '../shared/gitprompt'

describe('promptOf', () => {
  it('reads a key passphrase prompt, with or without colour codes', () => {
    expect(promptOf("Enter passphrase for key '/c/Users/huy/.ssh/id_ed25519': ")).toEqual({ kind: 'passphrase', label: '/c/Users/huy/.ssh/id_ed25519' })
    expect(promptOf("Enumerating objects: 5, done.\r\n\x1b[?25lEnter passphrase for key '/home/h/.ssh/id_rsa': ")).toMatchObject({ kind: 'passphrase', label: '/home/h/.ssh/id_rsa' })
  })

  it('reads password prompts for ssh and https remotes', () => {
    expect(promptOf("git@host's password: ")).toEqual({ kind: 'password', label: 'git@host' })
    expect(promptOf("Password for 'https://huy@github.com': ")).toEqual({ kind: 'password', label: 'https://huy@github.com' })
  })

  it('flags a host key question so it is never answered for the user', () => {
    expect(promptOf('Are you sure you want to continue connecting (yes/no/[fingerprint])? ')?.kind).toBe('hostkey')
  })

  it('is null while the output is only progress, or after the prompt was answered', () => {
    expect(promptOf('Writing objects: 100% (3/3), done.\n')).toBeNull()
    expect(promptOf("Enter passphrase for key 'k': \nEnumerating objects: 5")).toBeNull()
    expect(promptOf('')).toBeNull()
  })
})

describe('failureText', () => {
  it('keeps what git said and drops progress and the prompt', () => {
    const out = "Enter passphrase for key 'k': \r\nCounting objects: 3\r\ngit@github.com: Permission denied (publickey).\r\nfatal: Could not read from remote repository.\r\n"
    expect(failureText(out)).toBe('git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.')
  })
})
