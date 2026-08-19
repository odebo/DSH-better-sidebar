/**
 * Rewrite the image destinations of a markdown document so the preview can
 * render LOCAL images. The DSH `MarkdownText` renderer allowlists only
 * absolute `http(s)` image URLs (its untrusted-output policy drops relative
 * and `file:` destinations), so the preview hands it the raw source and every
 * `![](./img.png)` falls back to alt text. This module resolves each relative
 * destination against the document's directory and turns it into an absolute
 * media-route URL; remote http(s) URLs and other scheme/fragment destinations
 * pass through untouched for the renderer's own allowlist to decide.
 *
 * No markdown parser is bundled (the client half stays lean): the recognisers
 * below cover the common inline `![alt](url)` and reference-style
 * (`![alt][id]`, collapsed `![alt][]`, shortcut `![alt]`, with `[id]: url`
 * definitions) forms. Known limits match what a hand-written link already
 * rules out — alt text must not contain a `]` and a destination must not
 * contain an unescaped `)` (markdown itself requires escaping both).
 */
import { isAbsolutePath, parentOf } from './paths.ts'

/** A destination with an explicit scheme (`http:`, `data:`, `file:` …). */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/** Inline image `![alt](url)` or `![alt](url "title")`; the destination may
 *  be angle-bracketed (`<url>`) for URLs carrying spaces. */
const INLINE_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+[^)]*)?\)/g

/** Image reference `![alt][id]`, collapsed `![alt][]`, shortcut `![alt]`.
 *  The `(?!\()` guard stops the shortcut form from swallowing the prefix of an
 *  inline `![alt](url)` image. */
const IMAGE_REF_RE = /!\[([^\]]*)\](?:[ \t]*\[([^\]]*)\])?(?!\()/g

/** Reference definition `[id]: url` (≤3-space indent, optional trailing title). */
const REF_DEFINITION_RE = /^[ \t]{0,3}\[([^\]]+)\]:[ \t]*(<[^>]+>|[^\s]+)([ \t].*)?$/gm

/** Code regions that must never be image-rewritten: fenced blocks (a ``` / ~~~
 *  opener and its SAME-length closer, via backreference) and inline code
 *  spans (a backtick run with no newline inside). A `![x](a.png)` inside one
 *  of these is sample code, not an image. */
const CODE_MASK_RE = /(`{3,}|~{3,})[\s\S]*?\1|`+[^`\n]*`+/g

/** Mask code regions with NUL-delimited placeholders so the rewrite pass skips
 *  them; `restore` puts each original back verbatim (split/join, not replace,
 *  so `$`-sequences in the original never act as replacement tokens). */
function maskCode(source: string): { masked: string; restore: (text: string) => string } {
  const parts: string[] = []
  const masked = source.replace(CODE_MASK_RE, (whole) => {
    parts.push(whole)
    return `\u0000dshimg${parts.length - 1}\u0000`
  })
  const restore = (text: string): string => {
    let out = text
    for (let i = parts.length - 1; i >= 0; i--) {
      out = out.split(`\u0000dshimg${i}\u0000`).join(parts[i])
    }
    return out
  }
  return { masked, restore }
}

/**
 * Resolve an absolute path into its normal form: separators become `/`, and
 * `.` / `..` segments collapse (a `..` above the root is clamped, mirroring
 * `path.resolve`). The root prefix — POSIX `/`, Windows drive `C:/`, or UNC
 * `//server/share` — survives verbatim.
 */
function normalizeAbsolute(path: string): string {
  const slash = path.replace(/\\/g, '/')
  const unc = slash.match(/^\/\/[^/]+\/[^/]+/)
  const drive = slash.match(/^[A-Za-z]:/)
  let root: string
  let rest: string
  if (unc) {
    root = unc[0]
    rest = slash.slice(unc[0].length)
  } else if (drive) {
    root = `${drive[0]}/`
    rest = slash.slice(drive[0].length + 1)
  } else {
    root = '/'
    rest = slash.slice(1)
  }
  const parts: string[] = []
  for (const segment of rest.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (parts.length > 0) parts.pop()
      continue
    }
    parts.push(segment)
  }
  return root + parts.join('/')
}

/**
 * Resolve one raw destination (optionally angle-bracketed) against the
 * document's directory. Scheme/fragment/empty destinations return unchanged;
 * a relative or root-absolute path becomes `toMediaUrl(absolutePath)`.
 */
function resolveDestination(
  baseDir: string,
  raw: string,
  toMediaUrl: (absolutePath: string) => string,
): string {
  const url = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw
  const trimmed = url.trim()
  if (trimmed === '' || trimmed.startsWith('#')) return raw
  const rel = trimmed.replace(/\\/g, '/')
  // Absolute filesystem paths (POSIX root, Windows drive, UNC) resolve as
  // paths FIRST — a `C:` drive letter must not be mistaken for a URI scheme.
  if (isAbsolutePath(rel)) return toMediaUrl(normalizeAbsolute(rel))
  if (SCHEME_RE.test(rel)) return raw
  return toMediaUrl(normalizeAbsolute(`${baseDir}/${rel}`))
}

/**
 * Rewrite local image destinations of a markdown source in place.
 * @param source - the markdown text to preview.
 * @param filePath - the document's own absolute path (its directory is the
 *   resolution base for relative destinations).
 * @param toMediaUrl - maps an absolute filesystem path to an absolute media
 *   URL (the caller supplies the origin + session scope).
 * @returns the source with relative image destinations rewritten; remote and
 *   non-path destinations, and link-only reference definitions, are unchanged.
 */
export function rewriteMarkdownImages(
  source: string,
  filePath: string,
  toMediaUrl: (absolutePath: string) => string,
): string {
  const baseDir = parentOf(filePath)
  const rewrite = (raw: string): string => resolveDestination(baseDir, raw, toMediaUrl)

  // Run every pass on a code-masked copy so sample code (inline code spans and
  // fenced blocks) keeps its literal `![x](a.png)` text; restore afterwards.
  const { masked, restore } = maskCode(source)

  // Reference ids actually used by an IMAGE reference — a definition shared
  // with a link still resolves to the image, but a link-only definition must
  // never be redirected to the media route.
  const imageRefIds = new Set<string>()
  for (const match of masked.matchAll(IMAGE_REF_RE)) {
    const alt = match[1]
    const explicit = match[2]
    if (alt === undefined) continue
    const id = explicit !== undefined ? (explicit || alt) : alt
    imageRefIds.add(id.trim().toLowerCase())
  }

  const inlineRewritten = masked.replace(INLINE_IMAGE_RE, (whole, alt, url) => {
    const next = rewrite(url)
    return next === url ? whole : `![${alt}](${next})`
  })

  const rewritten = inlineRewritten.replace(REF_DEFINITION_RE, (whole, id, url, title) => {
    if (!imageRefIds.has(id.trim().toLowerCase())) return whole
    const next = rewrite(url)
    return next === url ? whole : `[${id}]: ${next}${title ?? ''}`
  })

  return restore(rewritten)
}
