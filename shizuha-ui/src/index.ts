/**
 * Shizuha UI - Shared UI components for Shizuha platform
 *
 * @example
 * ```tsx
 * import { AppSwitcher, HiveWordmark } from '@shizuha/ui'
 *
 * function Header() {
 *   return (
 *     <header>
 *       <HiveWordmark size="md" showSubtitle />
 *       <AppSwitcher currentAppId="pulse" />
 *     </header>
 *   )
 * }
 * ```
 */

// Components
export { AppSwitcher, default } from './components/AppSwitcher'
export { default as HiveWordmark } from './components/HiveWordmark'
export { GlobalNavBar, default as GlobalNavBarDefault } from './components/GlobalNavBar'

// Hooks
export { useEnabledServices } from './hooks/useEnabledServices'

// Data - Apps Registry (Single Source of Truth)
export {
  SHIZUHA_APPS,
  getAppSwitcherApps,
  getProductGridApps,
  getAppById,
  getAppsByCategory,
} from './data/apps'

// Types
export type { AppSwitcherProps, ShizuhaApp, HiveWordmarkProps, GlobalNavBarProps, GlobalNavItem, GlobalNavUser, ShizuhaSurfaceId } from './types'
export type { ShizuhaAppExtended } from './data/apps'
