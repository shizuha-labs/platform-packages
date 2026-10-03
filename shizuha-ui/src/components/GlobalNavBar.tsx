import { useMemo, useState } from 'react'
import {
  Bot,
  Building2,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Search,
  Settings,
  UserCircle,
  X,
} from 'lucide-react'
import type { GlobalNavBarProps, GlobalNavItem, ShizuhaSurfaceId } from '../types'

const SURFACE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  home: LayoutDashboard,
  connect: MessageCircle,
  hive: Bot,
  pulse: ListChecks,
  admin: Building2,
}

const DEFAULT_NAV_ITEMS: GlobalNavItem[] = [
  { label: 'Dashboard', href: '/', surface: 'home', icon: 'home' },
  { label: 'Connect', href: '/connect/', surface: 'connect', icon: 'connect' },
  { label: 'Agents', href: '/hive/', surface: 'hive', icon: 'hive', requiresOrganization: true },
  { label: 'Work', href: '/pulse/', surface: 'pulse', icon: 'pulse', requiresOrganization: true },
  { label: 'Admin', href: '/admin/', surface: 'admin', icon: 'admin', requiresOrganization: true },
]

function userInitial(user: GlobalNavBarProps['user']) {
  const value = user?.first_name || user?.name || user?.username || user?.email || 'U'
  return value.trim().charAt(0).toUpperCase() || 'U'
}

function userLabel(user: GlobalNavBarProps['user']) {
  return user?.first_name || user?.name || user?.username || user?.email || 'Account'
}

function positionClass(position: GlobalNavBarProps['position']) {
  if (position === 'fixed') return 'fixed top-0 left-0 right-0'
  if (position === 'static') return 'relative'
  return 'sticky top-0'
}

function inferredOrganizationAccess(user: GlobalNavBarProps['user']) {
  if (user?.organization_id !== undefined && user.organization_id !== null && user.organization_id !== '') return true
  if (Array.isArray(user?.organization_memberships)) return user.organization_memberships.length > 0
  if (user?.organization_memberships && typeof user.organization_memberships === 'object') {
    return Object.keys(user.organization_memberships).length > 0
  }
  return Array.isArray(user?.organizations) && user.organizations.length > 0
}

export function GlobalNavBar({
  activeSurface = 'home',
  navItems = DEFAULT_NAV_ITEMS,
  hasOrganization,
  user,
  isAuthenticated = false,
  onLogout,
  loginHref = '/id/login',
  registerHref = '/id/register',
  profileHref = '/profile/me',
  settingsHref = '/settings',
  searchHref = '/search/',
  onSearchClick,
  logoHref = '/',
  logoLabel = 'Shizuha',
  className = '',
  position = 'sticky',
}: GlobalNavBarProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)

  const currentSurface = activeSurface as ShizuhaSurfaceId
  const canUseOrganizationSurfaces = hasOrganization ?? inferredOrganizationAccess(user)
  const visibleNavItems = useMemo(
    () => navItems.filter(item => item.hidden !== true && (!item.requiresOrganization || canUseOrganizationSurfaces)),
    [canUseOrganizationSurfaces, navItems],
  )

  const handleSearchClick = () => {
    if (onSearchClick) {
      onSearchClick()
      return
    }
    if (searchHref) window.location.href = searchHref
  }

  const handleLogout = () => {
    if (onLogout) {
      onLogout()
      return
    }
    window.location.href = '/id/logout'
  }

  return (
    <nav className={`${positionClass(position)} z-[var(--z-navbar,50)] border-b border-gray-200 bg-white/90 backdrop-blur-lg dark:border-gray-800 dark:bg-gray-950/90 ${className}`}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex min-w-0 items-center gap-1">
            <a href={logoHref} className="mr-4 flex shrink-0 items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600">
                <span className="text-xs font-bold text-white">S</span>
              </div>
              <span className="hidden text-sm font-semibold text-gray-900 dark:text-white sm:block">
                {logoLabel}
              </span>
            </a>

            {isAuthenticated && <div className="hidden items-center gap-0.5 md:flex">
              {visibleNavItems.map(item => {
                const IconComponent = SURFACE_ICONS[item.icon || item.surface]
                const isActive = item.surface === currentSurface
                return (
                  <a
                    key={`${item.surface}:${item.href}`}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                    }`}
                  >
                    {IconComponent && <IconComponent className="h-4 w-4" />}
                    <span>{item.label}</span>
                  </a>
                )
              })}
            </div>}
          </div>

          <div className="flex items-center gap-1">
            {isAuthenticated && (searchHref || onSearchClick) && (
              <button
                type="button"
                onClick={handleSearchClick}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                title="Search"
                aria-label="Search"
              >
                <Search className="h-4 w-4" />
              </button>
            )}

            <div className="ml-1 hidden items-center gap-2 md:flex">
              {isAuthenticated ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsUserMenuOpen(open => !open)}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:hover:bg-gray-800"
                    aria-haspopup="menu"
                    aria-expanded={isUserMenuOpen}
                    aria-label="User menu"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{userInitial(user)}</span>
                    </div>
                    <span className="hidden max-w-32 truncate text-sm text-gray-700 dark:text-gray-300 lg:block">
                      {userLabel(user)}
                    </span>
                  </button>
                  {isUserMenuOpen && (
                    <div
                      className="absolute right-0 top-full z-[var(--z-dropdown,60)] mt-2 w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-800 dark:bg-gray-950"
                      role="menu"
                      aria-label="User menu"
                    >
                      <a href={profileHref} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                        <UserCircle className="h-4 w-4" />
                        Profile
                      </a>
                      <a href={settingsHref} role="menuitem" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800">
                        <Settings className="h-4 w-4" />
                        Settings
                      </a>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={handleLogout}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <a href={loginHref} className="px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
                    Sign in
                  </a>
                  <a href={registerHref} className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-700">
                    Get Started
                  </a>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="rounded-lg p-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:hover:bg-gray-800 md:hidden"
              aria-label="Toggle menu"
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              ) : (
                <Menu className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 md:hidden">
          <div className="space-y-1 px-4 py-3">
            {isAuthenticated && visibleNavItems.map(item => {
              const IconComponent = SURFACE_ICONS[item.icon || item.surface]
              const isActive = item.surface === currentSurface
              return (
                <a
                  key={`${item.surface}:${item.href}:mobile`}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/25 dark:text-amber-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
                  }`}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {IconComponent && <IconComponent className="h-4 w-4" />}
                  <span>{item.label}</span>
                </a>
              )
            })}
            {isAuthenticated ? (
              <>
                <a href={profileHref} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                  <UserCircle className="h-4 w-4" />
                  <span>{userLabel(user)}</span>
                </a>
                <a href={settingsHref} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </a>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Sign out</span>
                </button>
              </>
            ) : (
              <>
                <a href={loginHref} className="block rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
                  Sign in
                </a>
                <a href={registerHref} className="block rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700">
                  Get Started
                </a>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}

export default GlobalNavBar
