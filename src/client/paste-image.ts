/**
 * Image-paste helpers for the markdown editor: extract the first image from a
 * paste's clipboard, map its MIME type to a file extension, and compute where
 * the bytes land (an `assets/` directory next to the document) plus the
 * markdown-relative path the inserted `![](...)` reference uses.
 *
 * Pure functions stay dependency-free so they are unit-testable without a DOM;
 * only `imageFileFromClipboard` touches the clipboard `DataTransfer`.
 */
import { parentOf } from './paths.ts'

/** File extension (no dot) for a pasteable image MIME type; unknown → png. */
export function imageExtForType(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/gif': return 'gif'
    case 'image/webp': return 'webp'
    case 'image/svg+xml': return 'svg'
    case 'image/bmp': return 'bmp'
    case 'image/avif': return 'avif'
    default: return 'png'
  }
}

/** The first image file in a paste clipboard (null when the paste is text). */
export function imageFileFromClipboard(data: DataTransfer | null): File | null {
  if (data === null) return null
  for (const item of data.items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file !== null) return file
    }
  }
  return null
}

/**
 * Where one pasted image lands: `<md-dir>/assets/pasted-<stamp>-<rand>.<ext>`
 * (absolute), and the document-relative `assets/<name>` the markdown
 * reference inserts. The UTC stamp keeps the name monotonic and the random
 * suffix makes same-second pastes collision-free.
 */
export function pastedImageTarget(
  mdPath: string,
  ext: string,
  now: Date,
): { relativePath: string; absolutePath: string } {
  const stamp = now.toISOString().slice(0, 19).replace('T', '-').replace(/:/g, '')
  const rand = Math.random().toString(36).slice(2, 6)
  const name = `pasted-${stamp}-${rand}.${ext}`
  const dir = parentOf(mdPath)
  return {
    relativePath: `assets/${name}`,
    absolutePath: `${dir}/assets/${name}`,
  }
}
