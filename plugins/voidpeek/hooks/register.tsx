import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Peek } from '../types'

const items = atom({ plugin: 'voidpeek', key: 'items' } as const, [] as Peek[])

const PURPLE = '#6d28d9'
const SOFT = '#cbd5e1'
const MUTED = '#64748b'
const MAX_SHOWN = 4
const BACKSLASH = String.fromCharCode(92)

const size = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

const cache = new Map<number, Peek>()
const inflight = new Set<number>()
let imagesDir: string | undefined
let lastKey = ''
let currentSid = ''

const blank = (n: number): Peek => ({ n, path: '', bytes: 0, w: 0, h: 0 })

async function findImagesDir($: any): Promise<string | undefined> {
  if (imagesDir && (await $.fs.exists(imagesDir))) return imagesDir
  const found = await locateImagesDir($, await $.session.id())
  if (found) imagesDir = found
  return found
}

// Windows keeps the engine temp files in %TEMP%/claude, Linux and macOS in
// <tmp>/claude-<uid>; either way: <root>/<project>/<session>/images
async function isWindows($: any): Promise<boolean> {
  return (await $.env.get('OS')) === 'Windows_NT'
}

async function tempRoots($: any): Promise<string[]> {
  const bases = [
    await $.env.get('CLAUDE_CODE_TMPDIR'),
    await $.env.get('TEMP'),
    await $.env.get('TMP'),
    await $.env.get('TMPDIR'),
    '/tmp',
  ].filter((x): x is string => !!x)
  const roots: string[] = []
  for (const base of [...new Set(bases)]) {
    const entries: { name: string; kind: string }[] = await $.fs.list(base).catch(() => [])
    for (const e of entries) {
      if (e.name === 'claude' || e.name.startsWith('claude-')) roots.push(`${base}/${e.name}`)
    }
  }
  return roots
}

// the images folder of one session, wherever the engine keeps its temp files
async function locateImagesDir($: any, sid: string): Promise<string | undefined> {
  for (const root of await tempRoots($)) {
    const projects: { name: string }[] = await $.fs.list(root).catch(() => [])
    for (const p of projects) {
      const dir = `${root}/${p.name}/${sid}/images`
      if (await $.fs.exists(dir).catch(() => false)) return dir
    }
  }
  return undefined
}

// /clear: delete the leaving session's pasted images (only its own images folder)
async function wipeImages($: any, sid: string): Promise<void> {
  if (!sid) return
  const dir = await locateImagesDir($, sid)
  const isSafe = dir !== undefined && dir.endsWith(`/${sid}/images`) && dir.includes('/claude')
  if (!isSafe) return
  const argv = (await isWindows($))
    ? ['cmd.exe', '/c', 'rmdir', '/s', '/q', dir.split('/').join(BACKSLASH)]
    : ['rm', '-rf', '--', dir]
  await $.process.run(argv, { timeoutMs: 10000 }).catch(() => {})
}

async function findFile($: any, n: number): Promise<string | undefined> {
  const dir = await findImagesDir($)
  if (!dir) return undefined
  const files: { name: string }[] = await $.fs.list(dir).catch(() => [])
  const file = files.find(f => f.name.startsWith(`${n}.`))
  return file ? `${dir}/${file.name}` : undefined
}

// PNG header: width and height are big-endian u32 at bytes 16 and 20
async function pngSize($: any, path: string): Promise<{ w: number; h: number }> {
  try {
    const { base64 } = await $.fs.read(path, { as: 'bytes' })
    const b = Uint8Array.fromBase64(base64)
    const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    if (!isPng) return { w: 0, h: 0 }
    const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0
    return { w: u32(16), h: u32(20) }
  } catch {
    return { w: 0, h: 0 }
  }
}

async function describe($: any, n: number): Promise<Peek> {
  const path = await findFile($, n)
  if (!path) return blank(n)
  const stat = await $.fs.stat(path).catch(() => undefined)
  const dims = await pngSize($, path)
  return { n, path, bytes: stat?.size ?? 0, w: dims.w, h: dims.h }
}

async function loadOne($: any, n: number): Promise<void> {
  inflight.add(n)
  try {
    const peek = await describe($, n)
    if (peek.path) cache.set(n, peek)
  } catch {
    // keep polling: the file may not be on disk yet
  }
  inflight.delete(n)
  lastKey = ''
}

async function openFile($: any, path: string): Promise<void> {
  const run = (argv: string[]) => $.process.run(argv, { timeoutMs: 10000 })
  if (await isWindows($)) {
    await run(['cmd.exe', '/c', 'start', '', path.split('/').join(BACKSLASH)]).catch(() => {})
    return
  }
  // Linux first, macOS second
  await run(['xdg-open', path]).catch(() => run(['open', path]).catch(() => {}))
}

async function check($: any): Promise<void> {
  // /clear and resume keep this module alive under a new session id: start over
  const sid: string = await $.session.id()
  if (sid !== currentSid) {
    currentSid = sid
    cache.clear()
    inflight.clear()
    imagesDir = undefined
    lastKey = ''
    await update($, items, () => [])
  }
  const { text } = await $.prompt.read()
  const nums: number[] = [...new Set<number>([...text.matchAll(/\[Image #(\d+)\]/g)].map(m => Number(m[1])))]
  const key = nums.map(n => `${n}${cache.has(n) ? 'y' : 'n'}`).join(',')
  if (key === lastKey) return
  lastKey = key
  for (const n of nums) {
    if (!cache.has(n) && !inflight.has(n)) void loadOne($, n)
  }
  const shown = nums.map(n => cache.get(n) ?? blank(n))
  await update($, items, () => shown)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'peek',
      description: 'Abre uma imagem colada no visualizador do Windows: /peek 3 (sem número, a última)',
    })
    $.clock.every(300, () => void check($).catch(() => {}))
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await wipeImages($, e.sessionId)
    return next(e)
  })

  on('command.run', { command: 'peek' }, async ($, e) => {
    const asked = Number(e.args.trim())
    const dir = await findImagesDir($)
    if (!dir) return { text: 'Ainda não há imagens nesta sessão.' }
    const files: { name: string }[] = await $.fs.list(dir).catch(() => [])
    const nums = files.map(f => Number(f.name.split('.')[0])).filter(x => x > 0)
    const n = asked > 0 ? asked : Math.max(0, ...nums)
    const path = n > 0 ? await findFile($, n) : undefined
    if (!path) return { text: `Imagem #${n || '?'} não encontrada.` }
    await openFile($, path)
    return { text: `Abrindo a imagem #${n}.` }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, items)
    if (e.props.hasSurvey || e.surface !== 'terminal' || list.length === 0) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e) as any
    const extra = list.length - MAX_SHOWN

    return (
      <Box flexDirection='column' marginX={1}>
        {list.slice(0, MAX_SHOWN).map(t => (
          <Box key={`peek-${t.n}`} flexDirection='row' gap={1} borderStyle='round' borderColor={PURPLE} paddingX={1}>
            <Text color={PURPLE} bold>
              {`✦ Imagem #${t.n}`}
            </Text>
            {t.path ? (
              <Text color={SOFT}>
                {t.w > 0 ? `${t.w}×${t.h} · ` : ''}
                {size(t.bytes)}
              </Text>
            ) : (
              <Text color={MUTED}>preparando…</Text>
            )}
            {t.path ? (
              <Button key={`open-${t.n}`} label='🔍 Abrir' onPress={() => openFile($, t.path)} />
            ) : null}
          </Box>
        ))}
        {extra > 0 && <Text color={MUTED}>{`+${extra} imagens`}</Text>}
        <Text color={MUTED} dimColor>
          clique em Abrir, ou use /peek N
        </Text>
      </Box>
    )
  })
}
