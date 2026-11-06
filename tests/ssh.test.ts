import { describe, expect, it } from 'vitest'
import { forwardArg, parseSshConfig, sshArgs } from '../electron/services/ssh'

const base = { id: 'a', name: 'x', host: 'h' }

describe('sshArgs', () => {
  it('builds a plain connection', () => {
    expect(sshArgs({ ...base, host: 'example.com' })).toEqual(['-o', 'ServerAliveInterval=30', '--', 'example.com'])
  })
  it('adds user, port, key, jump host and a start command', () => {
    const args = sshArgs({ ...base, user: 'huy', port: 2222, identity: '~/.ssh/id', jump: 'me@bastion', command: 'cd /srv && exec $SHELL -l' }, '/home/huy')
    expect(args).toEqual(['-o', 'ServerAliveInterval=30', '-p', '2222', '-i', '/home/huy/.ssh/id', '-J', 'me@bastion', '-t', '--', 'huy@h', 'cd /srv && exec $SHELL -l'])
  })
  it('follows the authentication method', () => {
    expect(sshArgs({ ...base, auth: 'password', identity: 'k' })).toEqual(['-o', 'ServerAliveInterval=30', '-o', 'PreferredAuthentications=password,keyboard-interactive', '-o', 'PubkeyAuthentication=no', '--', 'h'])
    expect(sshArgs({ ...base, auth: 'key', identity: '/k' })).toEqual(['-o', 'ServerAliveInterval=30', '-o', 'IdentitiesOnly=yes', '-i', '/k', '--', 'h'])
    expect(sshArgs({ ...base, auth: 'agent' })).toContain('PreferredAuthentications=publickey')
    expect(sshArgs({ ...base, auth: 'interactive' })).toContain('PreferredAuthentications=keyboard-interactive,password')
  })
  it('adds port forwards', () => {
    const args = sshArgs({ ...base, forwards: [
      { id: '1', type: 'local', bindPort: 8080, destHost: 'db', destPort: 5432 },
      { id: '2', type: 'dynamic', bindHost: 'localhost', bindPort: 1080 },
    ] })
    expect(args).toEqual(expect.arrayContaining(['-L', '8080:db:5432', '-D', 'localhost:1080']))
  })
  it('refuses values ssh would read as options', () => {
    expect(() => sshArgs({ ...base, host: '-oProxyCommand=calc' })).toThrow()
    expect(() => sshArgs({ ...base, user: '-l' })).toThrow()
    expect(() => sshArgs({ ...base, jump: '-oX=y' })).toThrow()
    expect(() => sshArgs({ ...base, host: '' })).toThrow()
    expect(() => sshArgs({ ...base, port: 70000 })).toThrow()
    expect(() => sshArgs({ ...base, forwards: [{ id: '1', type: 'local', bindPort: 1, destHost: '-oX=y', destPort: 2 }] })).toThrow()
  })
})

describe('forwardArg', () => {
  it('writes remote forwards with -R and needs a destination', () => {
    expect(forwardArg({ id: '1', type: 'remote', bindPort: 9000, destHost: 'localhost', destPort: 3000 })).toEqual(['-R', '9000:localhost:3000'])
    expect(() => forwardArg({ id: '1', type: 'local', bindPort: 9000 })).toThrow()
  })
})

describe('parseSshConfig', () => {
  it('lists named hosts and leaves wildcards, comments and duplicates out', () => {
    const text = ['# my servers', 'Host web db', '  HostName 10.0.0.1', 'Host *', '  ForwardAgent no', 'Host staging-* ', 'Host web', 'host Bastion # jump', ''].join('\r\n')
    expect(parseSshConfig(text).map(h => h.host)).toEqual(['web', 'db', 'Bastion'])
  })
})
