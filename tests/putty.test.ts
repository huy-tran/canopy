import { describe, expect, it } from 'vitest'
import { mapPutty, parseForwards, parseRegQuery, parseSessionFile } from '../electron/services/putty'

const REG = `
HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Default%20Settings
    HostName    REG_SZ
    PortNumber    REG_DWORD    0x16

HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Web%20Server%20(prod)
    HostName    REG_SZ    deploy@web.example.com
    PortNumber    REG_DWORD    0x8ae
    Protocol    REG_SZ    ssh
    PublicKeyFile    REG_SZ    C:\\Users\\me\\Keys\\web.ppk
    PortForwardings    REG_SZ    L8080=db:5432,R9000=localhost:3000,D1080

HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Bastion
    HostName    REG_SZ    13.237.52.51
    PortNumber    REG_DWORD    0x16
    UserName    REG_SZ    admin
    Protocol    REG_SZ    ssh
    PublicKeyFile    REG_SZ    C:\\Users\\me\\Keys\\bastion.pem

HKEY_CURRENT_USER\\Software\\SimonTatham\\PuTTY\\Sessions\\Old%20Telnet
    HostName    REG_SZ    legacy.example.com
    Protocol    REG_SZ    telnet
`

describe('parseRegQuery', () => {
  const sessions = parseRegQuery(REG)
  it('reads each session key, decoding %XX in names and hex numbers', () => {
    expect(sessions.map(s => s.name)).toEqual(['Default Settings', 'Web Server (prod)', 'Bastion', 'Old Telnet'])
    expect(sessions[1]!.values.PortNumber).toBe('2222')
    expect(sessions[2]!.values.HostName).toBe('13.237.52.51')
  })
})

describe('mapPutty', () => {
  const m = mapPutty(parseRegQuery(REG))
  const by = (n: string) => m.hosts.find(h => h.name === n)!
  it('imports SSH sessions in a PuTTY group and skips the default and non-SSH ones', () => {
    expect(m.hosts.map(h => h.name)).toEqual(['Web Server (prod)', 'Bastion'])
    expect(m.skipped).toBe(1)
    expect(m.hosts.every(h => h.group === 'PuTTY')).toBe(true)
  })
  it('splits user@host and keeps port and port forwards', () => {
    expect(by('Web Server (prod)')).toMatchObject({ host: 'web.example.com', user: 'deploy', port: 2222 })
    expect(by('Web Server (prod)').forwards).toHaveLength(3)
  })
  it('leaves out a .ppk key that ssh cannot read, and keeps a usable one', () => {
    expect(by('Web Server (prod)')).toMatchObject({ auth: 'auto', identity: undefined })
    expect(by('Bastion')).toMatchObject({ auth: 'key', identity: 'C:\\Users\\me\\Keys\\bastion.pem', user: 'admin' })
    expect(m.ppk).toBe(1)
  })
})

describe('parseForwards', () => {
  it('reads local, remote and dynamic forwards', () => {
    const f = parseForwards('L8080=db:5432,R9000=localhost:3000,D1080,junk')
    expect(f.map(x => x.type)).toEqual(['local', 'remote', 'dynamic'])
    expect(f[0]).toMatchObject({ bindPort: 8080, destHost: 'db', destPort: 5432 })
    expect(f[2]).toMatchObject({ bindPort: 1080 })
  })
})

describe('parseSessionFile', () => {
  it('reads a ~/.putty/sessions file', () => {
    const s = parseSessionFile('My%20Box', 'HostName=box.example.com\nPortNumber=2200\nUserName=me\nProtocol=ssh\n')
    expect(mapPutty([s]).hosts[0]).toMatchObject({ name: 'My Box', host: 'box.example.com', port: 2200, user: 'me' })
  })
})
