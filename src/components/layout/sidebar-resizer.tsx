import { useCallback, useEffect, useRef } from 'react'
import {
  useSidebarStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_DEFAULT_WIDTH,
} from '@/components/layout/sidebar-store'
import { cn } from '@/lib/utils'

/** How far one arrow-key press moves the edge. */
const KEY_STEP = 16

/**
 * The draggable divider between the sidebar and the content.
 *
 * It is a `separator` with `aria-orientation="vertical"` and value semantics,
 * so it is operable from the keyboard as well as the mouse — a resize handle
 * that only responds to a pointer is a control some people simply cannot use.
 *
 * The visible hairline is 1px; the grab area is 9px, centred on it and pulled
 * half outside the sidebar. Hit targets and visual weight are different
 * problems and a 1px target is not hittable.
 */
export function SidebarResizer() {
  const setWidth = useSidebarStore((s) => s.setWidth)
  const commitWidth = useSidebarStore((s) => s.commitWidth)
  const setResizing = useSidebarStore((s) => s.setResizing)
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed)
  const resizing = useSidebarStore((s) => s.resizing)
  const width = useSidebarStore((s) => s.width)
  const collapsed = useSidebarStore((s) => s.collapsed)

  // The drag reads from a ref, not from React state: a pointermove handler
  // that closes over a state value would see the value from the render it was
  // attached in, and the sidebar would jump back on every frame.
  const draggingRef = useRef(false)

  const onPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!draggingRef.current) return
      // The sidebar starts at the viewport's left edge, so the pointer's x IS
      // the width. No offset bookkeeping, and no drift when the pointer leaves
      // the handle mid-drag.
      setWidth(event.clientX)
    },
    [setWidth],
  )

  const stopDragging = useCallback(() => {
    if (!draggingRef.current) return
    draggingRef.current = false
    setResizing(false)
    // The width is written once, here — see the note in the store.
    commitWidth()
    document.body.style.removeProperty('cursor')
    document.body.style.removeProperty('user-select')
  }, [setResizing, commitWidth])

  useEffect(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDragging)
    // A drag interrupted by an alt-tab or a context menu must not leave the
    // body stuck with a col-resize cursor and text selection disabled.
    window.addEventListener('pointercancel', stopDragging)
    window.addEventListener('blur', stopDragging)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', stopDragging)
      window.removeEventListener('pointercancel', stopDragging)
      window.removeEventListener('blur', stopDragging)
      stopDragging()
    }
  }, [onPointerMove, stopDragging])

  function startDragging(event: React.PointerEvent) {
    // Primary button only — a right-click on the divider should open the
    // context menu, not begin a drag that never gets a matching pointerup.
    if (event.button !== 0) return
    event.preventDefault()
    draggingRef.current = true
    setResizing(true)
    // Held on the body so the cursor stays correct while the pointer is over
    // the content area, and so dragging doesn't select the page text.
    document.body.style.setProperty('cursor', 'col-resize')
    document.body.style.setProperty('user-select', 'none')
  }

  function onKeyDown(event: React.KeyboardEvent) {
    const current = collapsed ? SIDEBAR_MIN_WIDTH : width
    const resize = (next: number) => {
      event.preventDefault()
      setWidth(next)
      // A keypress is a complete gesture, so it commits immediately.
      commitWidth()
    }

    if (event.key === 'ArrowLeft') resize(current - KEY_STEP)
    else if (event.key === 'ArrowRight') resize(current + KEY_STEP)
    else if (event.key === 'Home') resize(SIDEBAR_MIN_WIDTH)
    else if (event.key === 'End') resize(SIDEBAR_MAX_WIDTH)
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggleCollapsed()
    }
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={collapsed ? SIDEBAR_MIN_WIDTH : width}
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={startDragging}
      onKeyDown={onKeyDown}
      // Double-click restores the default, the way a column divider does.
      onDoubleClick={() => {
        setWidth(SIDEBAR_DEFAULT_WIDTH)
        commitWidth()
      }}
      className={cn(
        'group absolute inset-y-0 -right-1 z-20 hidden w-2 cursor-col-resize lg:block',
        'focus-visible:outline-none',
      )}
    >
      {/* The line itself. Invisible at rest — the sidebar's own border is the
          boundary — and picks up the accent on hover, drag or focus so the
          handle announces itself the moment you reach for it. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors duration-150',
          resizing
            ? 'bg-accent-primary'
            : 'bg-transparent group-hover:bg-accent-primary/60 group-focus-visible:bg-accent-primary',
        )}
      />
    </div>
  )
}
