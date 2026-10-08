// Cuts a release: the notes under "## [Unreleased]" in CHANGELOG.md become the new version's
// entry, the version is bumped, and a "Release x.y.z" commit and its v-tag are pushed, which
// starts the GitHub workflow that builds the installer and publishes the release.
//   npm run release -- minor          patch, minor, major or an exact version such as 1.2.3
//   npm run release -- minor --dry    show what would happen, change nothing
//   npm run release -- minor --no-push  commit and tag, but leave pushing to you
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const bump = args.find(a => !a.startsWith('--'))
const dry = args.includes('--dry')
const push = !args.includes('--no-push')

const run = (cmd, opts = {}) => execSync(cmd, { cwd: root, encoding: 'utf8', stdio: opts.show ? 'inherit' : 'pipe' })?.trim()
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

if (!bump) fail('Say which release: npm run release -- patch | minor | major | x.y.z')

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const [ma, mi, pa] = pkg.version.split('.').map(Number)
const version = { major: `${ma + 1}.0.0`, minor: `${ma}.${mi + 1}.0`, patch: `${ma}.${mi}.${pa + 1}` }[bump] || bump
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`"${bump}" is not patch, minor, major or a version like 1.2.3`)

// Only from an up-to-date master with nothing left uncommitted, since the tag ships what is committed.
if (run('git branch --show-current') !== 'master') fail('Release from master.')
if (run('git status --porcelain')) fail('Commit or stash your changes first.')
run('git fetch origin master')
if (run('git rev-list --count HEAD..origin/master') !== '0') fail('master is behind origin. Pull first.')
if (run(`git tag --list v${version}`)) fail(`v${version} already exists.`)

const logPath = path.join(root, 'CHANGELOG.md')
const log = fs.readFileSync(logPath, 'utf8')
const m = /^## \[Unreleased\]\s*\n([\s\S]*?)(?=^## \[)/m.exec(log)
if (!m || !m[1].trim()) fail('Write the release notes under "## [Unreleased]" in CHANGELOG.md first.')
const notes = m[1].trim()

const today = new Date()
const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
const link = `[${version}]: https://github.com/huy-tran/canopy/releases/tag/v${version}`
// A fresh, empty Unreleased section stays on top for the next release's notes.
const next = log
  .replace(m[0], `## [Unreleased]\n\n## [${version}] - ${date}\n\n${notes}\n\n`)
  .replace(/^\[\d+\.\d+\.\d+\]: /m, s => `${link}\n${s}`)

console.log(`${pkg.version} → ${version} (${date})\n\n${notes}\n`)
if (dry) {
  console.log('Dry run: nothing changed.')
  process.exit(0)
}

console.log('Typechecking…')
run('npm run typecheck', { show: true })
fs.writeFileSync(logPath, next)
run(`npm version ${version} --no-git-tag-version`)
run('git add CHANGELOG.md package.json package-lock.json')
run(`git commit -m "Release ${version}"`)
run(`git tag v${version}`)
if (push) {
  run('git push origin master', { show: true })
  run(`git push origin v${version}`, { show: true })
  console.log(`✓ Released v${version}. The Release workflow on GitHub builds the installer and publishes it.`)
} else {
  console.log(`✓ Committed and tagged v${version}. Push with: git push origin master v${version}`)
}
