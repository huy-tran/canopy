// File explorer icons by file name and extension. Names are full literals so the icon bundle scan picks them up.

interface FileIcon { icon: string; color: string }

const FILE: FileIcon = { icon: 'i-hugeicons-file-01', color: 'var(--mu)' }

const BY_NAME: Record<string, FileIcon> = {
  'package.json': { icon: 'i-hugeicons-npm', color: 'var(--red)' },
  'package-lock.json': { icon: 'i-hugeicons-npm', color: 'var(--red)' },
  'composer.json': { icon: 'i-hugeicons-php', color: 'var(--vio)' },
  'composer.lock': { icon: 'i-hugeicons-php', color: 'var(--vio)' },
  '.gitignore': { icon: 'i-hugeicons-git-branch', color: 'var(--red)' },
  '.gitattributes': { icon: 'i-hugeicons-git-branch', color: 'var(--red)' },
  'dockerfile': { icon: 'i-hugeicons-file-cog', color: 'var(--blue)' },
  'license': { icon: 'i-hugeicons-license', color: 'var(--amb)' },
  'tailwind.config.js': { icon: 'i-hugeicons-tailwindcss', color: 'var(--cyan)' },
  'tailwind.config.ts': { icon: 'i-hugeicons-tailwindcss', color: 'var(--cyan)' },
}

const BY_EXT: Record<string, FileIcon> = {
  ts: { icon: 'i-hugeicons-typescript-01', color: 'var(--blue)' },
  mts: { icon: 'i-hugeicons-typescript-01', color: 'var(--blue)' },
  cts: { icon: 'i-hugeicons-typescript-01', color: 'var(--blue)' },
  tsx: { icon: 'i-hugeicons-react', color: 'var(--cyan)' },
  jsx: { icon: 'i-hugeicons-react', color: 'var(--cyan)' },
  js: { icon: 'i-hugeicons-java-script', color: 'var(--amb)' },
  mjs: { icon: 'i-hugeicons-java-script', color: 'var(--amb)' },
  cjs: { icon: 'i-hugeicons-java-script', color: 'var(--amb)' },
  vue: { icon: 'i-hugeicons-file-code', color: 'var(--grn)' },
  php: { icon: 'i-hugeicons-php', color: 'var(--vio)' },
  py: { icon: 'i-hugeicons-python', color: 'var(--blue)' },
  java: { icon: 'i-hugeicons-java', color: 'var(--red)' },
  c: { icon: 'i-hugeicons-c-programming', color: 'var(--blue)' },
  h: { icon: 'i-hugeicons-c-programming', color: 'var(--blue)' },
  cpp: { icon: 'i-hugeicons-cpp', color: 'var(--blue)' },
  html: { icon: 'i-hugeicons-html-5', color: 'var(--red)' },
  css: { icon: 'i-hugeicons-css-3', color: 'var(--blue)' },
  scss: { icon: 'i-hugeicons-css-3', color: 'var(--vio)' },
  sass: { icon: 'i-hugeicons-css-3', color: 'var(--vio)' },
  less: { icon: 'i-hugeicons-css-3', color: 'var(--blue)' },
  json: { icon: 'i-hugeicons-file-braces', color: 'var(--amb)' },
  yml: { icon: 'i-hugeicons-file-sliders', color: 'var(--vio)' },
  yaml: { icon: 'i-hugeicons-file-sliders', color: 'var(--vio)' },
  toml: { icon: 'i-hugeicons-file-sliders', color: 'var(--mu)' },
  ini: { icon: 'i-hugeicons-file-sliders', color: 'var(--mu)' },
  env: { icon: 'i-hugeicons-file-key', color: 'var(--amb)' },
  xml: { icon: 'i-hugeicons-xml-01', color: 'var(--amb)' },
  md: { icon: 'i-hugeicons-file-text', color: 'var(--blue)' },
  mdx: { icon: 'i-hugeicons-file-text', color: 'var(--blue)' },
  txt: { icon: 'i-hugeicons-txt-01', color: 'var(--mu)' },
  csv: { icon: 'i-hugeicons-csv-01', color: 'var(--grn)' },
  xls: { icon: 'i-hugeicons-file-spreadsheet', color: 'var(--grn)' },
  xlsx: { icon: 'i-hugeicons-file-spreadsheet', color: 'var(--grn)' },
  pdf: { icon: 'i-hugeicons-pdf-01', color: 'var(--red)' },
  doc: { icon: 'i-hugeicons-doc-01', color: 'var(--blue)' },
  docx: { icon: 'i-hugeicons-doc-01', color: 'var(--blue)' },
  sql: { icon: 'i-hugeicons-sql', color: 'var(--amb)' },
  db: { icon: 'i-hugeicons-file-database', color: 'var(--amb)' },
  sqlite: { icon: 'i-hugeicons-file-database', color: 'var(--amb)' },
  sh: { icon: 'i-hugeicons-file-terminal', color: 'var(--grn)' },
  bash: { icon: 'i-hugeicons-file-terminal', color: 'var(--grn)' },
  ps1: { icon: 'i-hugeicons-file-terminal', color: 'var(--blue)' },
  bat: { icon: 'i-hugeicons-file-terminal', color: 'var(--grn)' },
  lock: { icon: 'i-hugeicons-file-lock', color: 'var(--mu)' },
  svg: { icon: 'i-hugeicons-svg-01', color: 'var(--amb)' },
  png: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  jpg: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  jpeg: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  gif: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  webp: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  ico: { icon: 'i-hugeicons-file-image', color: 'var(--vio)' },
  mp4: { icon: 'i-hugeicons-file-video', color: 'var(--vio)' },
  webm: { icon: 'i-hugeicons-file-video', color: 'var(--vio)' },
  mov: { icon: 'i-hugeicons-file-video', color: 'var(--vio)' },
  mp3: { icon: 'i-hugeicons-file-music', color: 'var(--vio)' },
  wav: { icon: 'i-hugeicons-file-music', color: 'var(--vio)' },
  zip: { icon: 'i-hugeicons-file-zip', color: 'var(--amb)' },
  gz: { icon: 'i-hugeicons-file-zip', color: 'var(--amb)' },
  tar: { icon: 'i-hugeicons-file-zip', color: 'var(--amb)' },
  ttf: { icon: 'i-hugeicons-file-type', color: 'var(--mu)' },
  otf: { icon: 'i-hugeicons-file-type', color: 'var(--mu)' },
  woff: { icon: 'i-hugeicons-file-type', color: 'var(--mu)' },
  woff2: { icon: 'i-hugeicons-file-type', color: 'var(--mu)' },
}

export function fileIcon(path: string): FileIcon {
  const name = path.slice(path.lastIndexOf('/') + 1).toLowerCase()
  if (BY_NAME[name]) return BY_NAME[name]
  if (name.startsWith('.env')) return BY_EXT.env!
  if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(name)) return { icon: 'i-hugeicons-test-tube', color: 'var(--grn)' }
  const dot = name.lastIndexOf('.')
  return (dot > 0 && BY_EXT[name.slice(dot + 1)]) || FILE
}

export function folderIcon(open: boolean): string {
  return open ? 'i-hugeicons-folder-open' : 'i-hugeicons-folder-01'
}
