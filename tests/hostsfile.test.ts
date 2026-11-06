import { describe, expect, it } from 'vitest'
import { parseCsv, parseHostsFile } from '../electron/services/hostsfile'

const CSV = `Groups,Label,Tags,Hostname/IP,Protocol,Port,Username,Password,SSH Key
Prod/Web,"Web, main",,web.example.com,ssh,2222,deploy,secret,
,Bastion,,13.237.52.51,ssh,,admin,,C:\\Keys\\b.pem
,Old,,legacy.example.com,telnet,23,root,,
,Bad,,bad host;rm,ssh,22,root,,
`

describe('parseCsv', () => {
  it('handles quotes, commas inside quotes and blank lines', () => {
    expect(parseCsv('a,"b,""c""",d\r\n\r\ne,f,g\n')).toEqual([['a', 'b,"c"', 'd'], ['e', 'f', 'g']])
  })
})

describe('parseHostsFile', () => {
  it('reads a CSV export by its header names and skips non-SSH or unsafe rows', () => {
    const r = parseHostsFile('termius.csv', CSV)
    expect(r.hosts.map(h => h.name)).toEqual(['Web, main', 'Bastion'])
    expect(r.skipped).toBe(2)
    expect(r.hosts[0]).toMatchObject({ host: 'web.example.com', port: 2222, user: 'deploy', group: 'Web', auth: 'auto' })
    expect(r.hosts[1]).toMatchObject({ port: 22, auth: 'key', identity: 'C:\\Keys\\b.pem' })
    expect(JSON.stringify(r)).not.toContain('secret')
  })
  it('reads an ssh config with HostName, User, Port and IdentityFile', () => {
    const r = parseHostsFile('config', 'Host *\n  User x\nHost app\n  HostName app.example.com\n  User me\n  Port 2200\n  IdentityFile ~/.ssh/app\n')
    expect(r.hosts).toHaveLength(1)
    expect(r.hosts[0]).toMatchObject({ name: 'app', host: 'app.example.com', user: 'me', port: 2200, identity: '~/.ssh/app', auth: 'key' })
  })
})
