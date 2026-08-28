/**
 * FileTree "up" navigation: the root row gains an "up" control that walks
 * past the workspace cwd into parent directories, so a session bound to one
 * directory can still browse (and act on) content outside it. A single-level
 * root child (e.g. `/tmp`) has no reachable parent under the client's
 * parentOf mirror, so the control hides there instead of navigating to ''.
 */
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { FileTree } from '../src/client/FileTree.tsx'
import { api } from '../src/client/api.ts'

// The act() environment flag (React 18.2 reads it before flushing effects).
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

/** Mount FileTree with a stubbed fsTree; returns helpers. */
function mountTree(cwd: string): {
  container: HTMLDivElement
  fsTree: ReturnType<typeof vi.fn>
  unmount: () => void
} {
  const fsTree = vi.fn(async (_scope: unknown, path: string) => ({ path, entries: [], truncated: false }))
  vi.spyOn(api, 'fsTree').mockImplementation(fsTree)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(createElement(FileTree, {
      sessionId: 's1',
      cwd,
      expanded: [],
      onToggle: () => {},
      onOpenFile: () => {},
      onReferenceFile: () => {},
      refreshTick: 0,
    }))
  })
  return {
    container,
    fsTree,
    unmount: () => {
      act(() => { root.unmount() })
      container.remove()
    },
  }
}

/** The "up" control (aria-label is the locale copy for the `parent` key). */
const UP_LABEL = 'Parent directory'

describe('FileTree "up" navigation', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('roots at the cwd and the "up" control navigates to the parent directory', () => {
    const { container, fsTree, unmount } = mountTree('/Users/alice/project')

    // Initial load targets the session cwd and the root row shows its name.
    expect(fsTree).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }), '/Users/alice/project')
    expect(container.textContent).toContain('project')

    const up = container.querySelector(`button[aria-label="${UP_LABEL}"]`)
    expect(up).not.toBeNull()

    act(() => {
      up!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    // The tree re-roots at the parent and fetches its level.
    expect(fsTree).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }), '/Users/alice')
    expect(container.textContent).toContain('alice')
    unmount()
  })

  it('walks multiple levels up until the root is reached', () => {
    const { container, fsTree, unmount } = mountTree('/Users/alice/project/src')

    const click = (): void => {
      const up = container.querySelector(`button[aria-label="${UP_LABEL}"]`)!
      act(() => { up.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    }

    click() // → /Users/alice/project
    expect(fsTree).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }), '/Users/alice/project')
    click() // → /Users/alice
    expect(fsTree).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }), '/Users/alice')
    click() // → /Users
    expect(fsTree).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }), '/Users')

    // /Users is a single-level root child: its parent resolves to '' (no
    // reachable parent), so the "up" control disappears.
    expect(container.querySelector(`button[aria-label="${UP_LABEL}"]`)).toBeNull()
    unmount()
  })

  it('hides the "up" control when the cwd itself is a single-level root child', () => {
    const { container, unmount } = mountTree('/tmp')
    expect(container.querySelector(`button[aria-label="${UP_LABEL}"]`)).toBeNull()
    unmount()
  })
})
