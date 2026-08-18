import { describe, expect, it } from 'vitest'
import { imageExtForType, imageFileFromClipboard, pastedImageTarget } from '../src/client/paste-image.ts'

describe('imageExtForType', () => {
  it('maps known image MIME types to extensions', () => {
    expect(imageExtForType('image/png')).toBe('png')
    expect(imageExtForType('image/jpeg')).toBe('jpg')
    expect(imageExtForType('image/gif')).toBe('gif')
    expect(imageExtForType('image/webp')).toBe('webp')
    expect(imageExtForType('image/svg+xml')).toBe('svg')
    expect(imageExtForType('image/bmp')).toBe('bmp')
    expect(imageExtForType('image/avif')).toBe('avif')
  })

  it('falls back to png for unknown types', () => {
    expect(imageExtForType('image/x-unknown')).toBe('png')
    expect(imageExtForType('text/plain')).toBe('png')
  })
})

describe('imageFileFromClipboard', () => {
  it('returns null for a null or image-free clipboard', () => {
    expect(imageFileFromClipboard(null)).toBeNull()
    expect(imageFileFromClipboard({ items: [] } as unknown as DataTransfer)).toBeNull()
  })

  it('returns the first image item file', () => {
    const file = {} as File
    const data = {
      items: [
        { type: 'text/plain', getAsFile: () => null },
        { type: 'image/png', getAsFile: () => file },
      ],
    } as unknown as DataTransfer
    expect(imageFileFromClipboard(data)).toBe(file)
  })
})

describe('pastedImageTarget', () => {
  const now = new Date('2026-08-18T16:57:00Z')
  const nameRe = /^assets\/pasted-2026-08-18-165700-[a-z0-9]{4}\.png$/

  it('lands in assets/ next to the document (POSIX)', () => {
    const { relativePath, absolutePath } = pastedImageTarget('/docs/guide.md', 'png', now)
    expect(relativePath).toMatch(nameRe)
    expect(absolutePath).toBe(`/docs/${relativePath}`)
  })

  it('joins a Windows parent with forward slashes', () => {
    const { relativePath, absolutePath } = pastedImageTarget('C:\\docs\\guide.md', 'png', now)
    expect(relativePath).toMatch(nameRe)
    expect(absolutePath).toBe(`C:\\docs/${relativePath}`)
  })

  it('resolves from the filesystem root', () => {
    const { relativePath, absolutePath } = pastedImageTarget('/guide.md', 'png', now)
    expect(absolutePath).toBe(`/${relativePath}`)
  })

  it('carries the extension through', () => {
    const { relativePath } = pastedImageTarget('/docs/guide.md', 'webp', now)
    expect(relativePath).toMatch(/\.webp$/)
  })
})
