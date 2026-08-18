import { describe, expect, it } from 'vitest'
import { rewriteMarkdownImages } from '../src/client/markdown-images.ts'

const media = (absolute: string): string => `media:${absolute}`

describe('rewriteMarkdownImages', () => {
  it('resolves inline relative destinations against the document directory', () => {
    expect(rewriteMarkdownImages('![x](./a.png)', '/docs/guide.md', media))
      .toBe('![x](media:/docs/a.png)')
    expect(rewriteMarkdownImages('![x](a.png)', '/docs/guide.md', media))
      .toBe('![x](media:/docs/a.png)')
    expect(rewriteMarkdownImages('![x](sub/dir/y.png)', '/docs/guide.md', media))
      .toBe('![x](media:/docs/sub/dir/y.png)')
  })

  it('collapses ../ segments and normalises backslashes', () => {
    expect(rewriteMarkdownImages('![x](../shared/x.png)', '/docs/guide.md', media))
      .toBe('![x](media:/shared/x.png)')
    expect(rewriteMarkdownImages('![x](sub\\img.png)', '/docs/guide.md', media))
      .toBe('![x](media:/docs/sub/img.png)')
    expect(rewriteMarkdownImages('![x](C:\\abs\\img.png)', '/docs/guide.md', media))
      .toBe('![x](media:C:/abs/img.png)')
  })

  it('passes remote, scheme, and fragment destinations through unchanged', () => {
    expect(rewriteMarkdownImages('![x](https://example.com/a.png)', '/docs/guide.md', media))
      .toBe('![x](https://example.com/a.png)')
    expect(rewriteMarkdownImages('![x](data:image/png;base64,AAA)', '/docs/guide.md', media))
      .toBe('![x](data:image/png;base64,AAA)')
    expect(rewriteMarkdownImages('![x](#anchor)', '/docs/guide.md', media))
      .toBe('![x](#anchor)')
  })

  it('resolves an angle-bracketed destination', () => {
    expect(rewriteMarkdownImages('![x](<my img.png>)', '/docs/guide.md', media))
      .toBe('![x](media:/docs/my img.png)')
  })

  it('rewrites reference definitions used by an image reference', () => {
    expect(rewriteMarkdownImages('![logo][l]\n\n[l]: ./logo.png', '/docs/guide.md', media))
      .toBe('![logo][l]\n\n[l]: media:/docs/logo.png')
  })

  it('resolves collapsed and shortcut image references', () => {
    expect(rewriteMarkdownImages('![logo][]\n\n[logo]: img/logo.png', '/docs/guide.md', media))
      .toBe('![logo][]\n\n[logo]: media:/docs/img/logo.png')
    expect(rewriteMarkdownImages('![logo]\n\n[logo]: ./logo.png', '/docs/guide.md', media))
      .toBe('![logo]\n\n[logo]: media:/docs/logo.png')
  })

  it('keeps a link-only definition untouched', () => {
    expect(rewriteMarkdownImages('[text][l]\n\n[l]: ./x.png', '/docs/guide.md', media))
      .toBe('[text][l]\n\n[l]: ./x.png')
  })

  it('preserves a definition title and drops an inline title', () => {
    expect(rewriteMarkdownImages('![x][l]\n\n[l]: ./a.png "a title"', '/docs/guide.md', media))
      .toBe('![x][l]\n\n[l]: media:/docs/a.png "a title"')
    expect(rewriteMarkdownImages('![x](./a.png "title")', '/docs/guide.md', media))
      .toBe('![x](media:/docs/a.png)')
  })

  it('leaves a remote definition feeding an image unchanged', () => {
    expect(rewriteMarkdownImages('![logo][l]\n\n[l]: https://example.com/logo.png', '/docs/guide.md', media))
      .toBe('![logo][l]\n\n[l]: https://example.com/logo.png')
  })
})
