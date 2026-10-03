/**
 * Types for @shizuha/ui components
 */

import type { ReactNode } from 'react'

export interface HiveWordmarkProps {
  /**
   * Size variant
   * @default 'md'
   */
  size?: 'sm' | 'md' | 'lg'
  /**
   * Show only the hex mark, hide text
   */
  markOnly?: boolean
  /**
   * Show only the wordmark text, hide mark
   */
  textOnly?: boolean
  /**
   * Show "Agent Home" subtitle below the wordmark
   */
  showSubtitle?: boolean
  /**
   * Custom class name for the container
   */
  className?: string
}

export interface ShizuhaApp {
  id: string
  name: string
  description: string
  path: string
  icon: string
  bgColor: string
  /** Optional display shortcut label. Defaults to ⌘/Ctrl+position when shortcuts are enabled. */
  shortcut?: string
}

export type AppSwitcherVariant = 'grid' | 'compact'
export type AppSwitcherAccessStatus = 'ready' | 'loading' | 'error'

export interface AppSwitcherProps {
  /** The ID of the current app to highlight in the switcher */
  currentAppId?: string
  /** Custom class name for the container */
  className?: string
  /** Position of the popover relative to the button @default 'left' */
  popoverPosition?: 'left' | 'right'
  /**
   * List of enabled service slugs from the host surface's auth/access context.
   * If provided, only these services (plus always-visible apps) are shown.
   * If null/undefined, all apps are shown for backwards compatibility.
   */
  enabledServices?: string[] | null
  /** Access loading state owned by the host surface; the switcher never fetches. */
  accessStatus?: AppSwitcherAccessStatus
  /** Host-provided app list. Defaults to the shared Shizuha registry. */
  apps?: ShizuhaApp[]
  /** Compact list menu for app-shell sidebars, grid menu for global headers. */
  variant?: AppSwitcherVariant
  /** Enable global Cmd/Ctrl+1..9 app shortcuts. @default false */
  enableShortcuts?: boolean
  /** Show shortcut labels in the menu. @default true */
  showShortcuts?: boolean
  /** Override the trigger label for accessibility/tooltips. */
  triggerLabel?: string
  /** Optional custom trigger, useful when a shell composes its wordmark. */
  renderTrigger?: (state: { open: boolean }) => ReactNode
  /** Navigation hook; return false to keep default anchor navigation. */
  onNavigate?: (app: ShizuhaApp) => void | boolean
  /** Empty-state copy when access filtering leaves no apps. */
  emptyLabel?: string
}

export type ShizuhaSurfaceId = 'home' | 'connect' | 'hive' | 'pulse' | 'admin' | string

export interface GlobalNavItem {
  label: string
  href: string
  surface: ShizuhaSurfaceId
  /** Icon key: defaults to the surface id when omitted. */
  icon?: string
  hidden?: boolean
  /** Hide the item for signed-in users who do not have an organization yet. */
  requiresOrganization?: boolean
}

export interface GlobalNavUser {
  first_name?: string
  name?: string
  username?: string
  email?: string
  organization_id?: string | number | null
  organization_memberships?: Record<string, unknown> | unknown[] | null
  organizations?: unknown[] | null
}

export interface GlobalNavBarProps {
  /** Active platform surface to highlight in the nav. */
  activeSurface?: ShizuhaSurfaceId
  /** Override nav items; defaults to Dashboard, Connect, Agents, Work, Admin. */
  navItems?: GlobalNavItem[]
  /** Explicit organization access; inferred from the user object when omitted. */
  hasOrganization?: boolean
  user?: GlobalNavUser | null
  isAuthenticated?: boolean
  onLogout?: () => void
  loginHref?: string
  registerHref?: string
  profileHref?: string
  settingsHref?: string
  /** Global search destination; use onSearchClick for an overlay. */
  searchHref?: string
  onSearchClick?: () => void
  logoHref?: string
  logoLabel?: string
  className?: string
  /** Header positioning. Sticky keeps layout flow; fixed is for app shells that add their own top padding. */
  position?: 'sticky' | 'fixed' | 'static'
}
