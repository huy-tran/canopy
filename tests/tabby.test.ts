import crypto from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { configOfVault, decryptTabbyVault, keyPath, mapTabby } from '../electron/services/tabby'

const CONFIG = `
groups:
  - id: g1
    name: AFN
profiles:
  - id: ssh:bastion
    type: ssh
    name: Bastion
    options:
      host: bastion.example.com
      user: ops
      port: 2222
  - id: ssh:lightsail
    type: ssh
    name: AFN Lightsail
    group: g1
    options:
      host: 13.237.52.51
      port: 22
      user: admin
      auth: publicKey
      privateKeys:
        - 'file://C:\\Users\\me\\Keys\\afn.pem'
      jumpHost: ssh:bastion
      forwardedPorts:
        - { type: Local, host: 127.0.0.1, port: 8080, targetAddress: db, targetPort: 5432 }
        - { type: Dynamic, host: 127.0.0.1, port: 1080 }
        - { type: Local, host: 127.0.0.1, port: 9, targetAddress: '' }
  - id: ssh:pw
    type: ssh
    name: Old box
    options: { host: old.example.com, user: root, auth: password }
  - id: ssh:broken
    type: ssh
    name: No host
    options: { user: root }
  - id: local:powershell
    type: local
    name: PowerShell
`

function vaultOf(plain: unknown, passphrase: string) {
  const salt = crypto.randomBytes(8), iv = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha512')
  const c = crypto.createCipheriv('aes-256-cbc', key, iv)
  const contents = Buffer.concat([c.update(JSON.stringify(plain)), c.final()]).toString('base64')
  return { version: 1, contents, keySalt: salt.toString('hex'), iv: iv.toString('hex') }
}

describe('decryptTabbyVault', () => {
  it('opens a vault with its passphrase and refuses a wrong one', async () => {
    const vault = vaultOf({ config: { content: CONFIG }, secrets: [] }, 'correct horse')
    expect(await decryptTabbyVault(vault, 'correct horse')).toMatchObject({ secrets: [] })
    expect(await decryptTabbyVault(vault, 'wrong')).toBeNull()
  })
})

describe('configOfVault', () => {
  it('finds the config and secrets however they are nested', () => {
    expect(configOfVault({ config: { content: CONFIG }, secrets: [{ type: 'ssh:password' }] })?.secrets).toHaveLength(1)
    expect(Array.isArray(configOfVault({ config: CONFIG })?.config.profiles)).toBe(true)
    expect(Array.isArray(configOfVault({ profiles: [], secrets: [] })?.config.profiles)).toBe(true)
    expect(configOfVault('nope')).toBeNull()
  })
})

describe('mapTabby', () => {
  const secrets = [{ type: 'ssh:password', key: { user: 'root', host: 'old.example.com' }, value: 'hunter2' }]
  const m = mapTabby(parse(CONFIG), secrets)
  const by = (name: string) => m.hosts.find(h => h.name === name)!

  it('imports SSH profiles only and counts those without a host', () => {
    expect(m.hosts.map(h => h.name)).toEqual(['Bastion', 'AFN Lightsail', 'Old box'])
    expect(m.skipped).toBe(1)
  })
  it('keeps groups, login method, key and jump host', () => {
    const h = by('AFN Lightsail')
    expect(h).toMatchObject({ host: '13.237.52.51', port: 22, user: 'admin', auth: 'key', group: 'AFN', identity: 'C:\\Users\\me\\Keys\\afn.pem', jump: 'ops@bastion.example.com:2222' })
  })
  it('maps port forwards and drops incomplete ones', () => {
    const f = by('AFN Lightsail').forwards!
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ type: 'local', bindHost: '127.0.0.1', bindPort: 8080, destHost: 'db', destPort: 5432 })
    expect(f[1]).toMatchObject({ type: 'dynamic', bindPort: 1080 })
  })
  it('matches saved passwords to their profile', () => {
    expect(m.passwords).toEqual({ 'ssh:pw': 'hunter2' })
    expect(by('Old box').auth).toBe('password')
  })
})

describe('keyPath', () => {
  it('strips file:// and a leading slash before a drive letter', () => {
    expect(keyPath('file://C:\\k\\a.pem')).toBe('C:\\k\\a.pem')
    expect(keyPath('file:///C:/k/a.pem')).toBe('C:/k/a.pem')
    expect(keyPath('~/.ssh/id')).toBe('~/.ssh/id')
    expect(keyPath('')).toBeUndefined()
  })
})
