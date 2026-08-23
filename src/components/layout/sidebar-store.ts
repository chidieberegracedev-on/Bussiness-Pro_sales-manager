import { create } from 'zustand'

/** The user's chosen EXPANDED width. Never the rail width. */
const WIDTH_KEY = 'bp-sidebar-width'
/** Whether they are currently in the icon rail. Orthogonal to the width. */
const COLLAPSED_KEY = 'bp-sidebar-collapsed'

/** Icon-only rail. Wide enough for a 40px hit target plus breathing room. */
export const SIDEBAR_MIN_WIDTH = 64
export const SIDEBAR_MAX_WIDTH = 420
export const SIDEBAR_DEFAULT_WIDTH = 256

/**
 * Below this the sidebar snaps shut to the rail rather than showing clipped
 * labels. Dragging left past it collapses; dragging right past it expands.
 * A sidebar that can sit at 130px — wide enough to show "Purchas…" and not the
 * icon — is worse than either end state.
 */
export const SIDEBAR_SNAP_WIDTH = 150

interface SidebarState {
  /** Live width in px. Meaningful only when expanded. */
  width: number
  collapsed: boolean
  /** True while a drag is in flight, so transitions can be suppressed. */
  resizing: boolean
  mobileOpen: boolean

  setWidth: (width: number) => void
  /** Write the current width to storage. Called when a drag ends, not during. */
  commitWidth: () => void
  setResizing: (resizing: boolean) => void
  toggleCollapsed: () => void
  setMobileOpen: (open: boolean) => void
}

function clamp(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width))
}

/**
 * Two independent values, deliberately.
 *
 * The first attempt encoded both in one number — "stored width <= rail width
 * means collapsed" — which loses the user's chosen width the moment they
 * collapse. Someone who drags the sidebar to 340px, collapses it to get room,
 * then expands again should get their 340px back, not the default. The width
 * is *what expanded means for this user*; collapsed is a separate, transient
 * choice about whether they are using it right now.
 */
function readStored(): { width: number; collapsed: boolean } {
  try {
    const rawWidth = Number(localStorage.getItem(WIDTH_KEY))
    const width =
      Number.isFinite(rawWidth) && rawWidth > SIDEBAR_SNAP_WIDTH
        ? clamp(rawWidth)
        : SIDEBAR_DEFAULT_WIDTH
    return { width, collapsed: localStorage.getItem(COLLAPSED_KEY) === 'true' }
  } catch {
    // Private mode, or site data blocked. Defaults are a fine answer.
    return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false }
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not being able to remember a preference is not worth breaking a drag over.
  }
}

const initial = readStored()

export const useSidebarStore = create<SidebarState>((set, get) => ({
  width: initial.width,
  collapsed: initial.collapsed,
  resizing: false,
  mobileOpen: false,

  setWidth: (raw) => {
    const width = clamp(raw)
    // Snap rather than allowing a half-width sidebar with clipped labels.
    if (width <= SIDEBAR_SNAP_WIDTH) {
      persist(COLLAPSED_KEY, 'true')
      // The stored width is untouched: dragging shut must not erase the width
      // to come back to.
      set({ collapsed: true })
      return
    }
    persist(COLLAPSED_KEY, 'false')
    // Width is NOT persisted here. A drag from 340px to closed passes through
    // every width in between, so persisting per-move left the last value
    // above the snap threshold (~152px) in storage and the user's real choice
    // was gone by the time they let go.
    set({ width, collapsed: false })
  },

  commitWidth: () => {
    if (get().collapsed) return
    persist(WIDTH_KEY, String(get().width))
  },

  setResizing: (resizing) => set({ resizing }),

  toggleCollapsed: () => {
    const next = !get().collapsed
    persist(COLLAPSED_KEY, String(next))
    set({ collapsed: next })
  },

  setMobileOpen: (open) => set({ mobileOpen: open }),
}))
