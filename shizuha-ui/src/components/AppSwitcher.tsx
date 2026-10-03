import { useState, useRef, useEffect, useMemo } from 'react'
import {
  LayoutGrid,
  LayoutDashboard,
  HeartPulse,
  StickyNote,
  BookOpen,
  UserCircle,
  Package,
  Mail,
  Cloud,
  HardDrive,
  Users,
  Wallet,
  Calculator,
  UserCog,
  Clock,
  Bot,
  Building2,
  TrendingUp,
  MessageCircle,
  ShoppingBag,
  X,
  Check,
} from 'lucide-react'
import type { AppSwitcherAccessStatus, AppSwitcherProps, ShizuhaApp } from '../types'
import { getAppSwitcherApps } from '../data/apps'

const DEFAULT_APPS = getAppSwitcherApps()

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard,
  HeartPulse,
  StickyNote,
  BookOpen,
  Package,
  Mail,
  UserCircle,
  Cloud,
  HardDrive,
  Users,
  Wallet,
  Calculator,
  UserCog,
  Clock,
  Bot,
  Building2,
  TrendingUp,
  MessageCircle,
  ShoppingBag,
}

const ALWAYS_VISIBLE = new Set(['home', 'admin', 'id'])

function isServiceEnabled(app: ShizuhaApp, enabledServices: string[], currentAppId?: string) {
  if (app.id === currentAppId) return true
  if (enabledServices.includes(app.id)) return true
  return app.id === 'hive' && enabledServices.includes('agent')
}

function shortcutLabel(index: number) {
  return `⌘${index + 1}`
}

function normalizeAccessStatus(status?: AppSwitcherAccessStatus) {
  return status || 'ready'
}

export function AppSwitcher({
  currentAppId,
  className = '',
  popoverPosition = 'left',
  enabledServices,
  accessStatus,
  apps,
  variant = 'grid',
  enableShortcuts = false,
  showShortcuts = true,
  triggerLabel = 'Switch platform app',
  renderTrigger,
  onNavigate,
  emptyLabel = 'No apps available',
}: AppSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const registry = apps || DEFAULT_APPS
  const status = normalizeAccessStatus(accessStatus)

  const visibleApps = useMemo(() => {
    if (!enabledServices) return registry
    return registry.filter(app =>
      ALWAYS_VISIBLE.has(app.id) || isServiceEnabled(app, enabledServices, currentAppId)
    )
  }, [enabledServices, currentAppId, registry])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
    return undefined
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    function handleMenuKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
        return
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) return
      const items = itemRefs.current.filter(Boolean) as HTMLAnchorElement[]
      if (!items.length) return
      const currentIndex = items.indexOf(document.activeElement as HTMLAnchorElement)
      if (event.key === 'Enter' && currentIndex >= 0) return
      event.preventDefault()
      let nextIndex = 0
      if (event.key === 'End') nextIndex = items.length - 1
      else if (event.key === 'ArrowUp') nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1
      else if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
      items[nextIndex]?.focus()
    }
    document.addEventListener('keydown', handleMenuKeys)
    return () => document.removeEventListener('keydown', handleMenuKeys)
  }, [isOpen])

  useEffect(() => {
    if (!enableShortcuts) return undefined
    function handleShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      if (!/^[1-9]$/.test(event.key)) return
      const app = visibleApps[Number(event.key) - 1]
      if (!app || app.id === currentAppId) return
      event.preventDefault()
      const handled = onNavigate?.(app)
      if (handled !== false) window.location.href = app.path
    }
    document.addEventListener('keydown', handleShortcut)
    return () => document.removeEventListener('keydown', handleShortcut)
  }, [currentAppId, enableShortcuts, onNavigate, visibleApps])

  const handleAppClick = (event: React.MouseEvent<HTMLAnchorElement>, app: ShizuhaApp) => {
    if (app.id === currentAppId) {
      event.preventDefault()
      setIsOpen(false)
      return
    }
    const handled = onNavigate?.(app)
    if (handled !== false && handled !== undefined) event.preventDefault()
    setIsOpen(false)
  }

  const positionClass = popoverPosition === 'right' ? 'right-0' : 'left-0'
  const menuWidth = variant === 'compact' ? 'w-64' : 'w-80'

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={triggerLabel}
        className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:hover:bg-gray-700 ${isOpen ? 'bg-gray-100 dark:bg-gray-700' : ''}`}
        aria-label={triggerLabel}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {renderTrigger ? renderTrigger({ open: isOpen }) : <LayoutGrid className="h-5 w-5 text-gray-600 dark:text-gray-400" />}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/20 lg:hidden"
            onClick={() => setIsOpen(false)}
          />

          <div
            ref={popoverRef}
            role="menu"
            aria-label="Platform apps"
            className={`absolute ${positionClass} top-full mt-2 z-50 ${menuWidth} rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800`}
            style={{ animation: 'shizuha-ui-fadeIn 0.15s ease-out' }}
          >
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Shizuha Apps</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:hover:bg-gray-700 lg:hidden"
                aria-label="Close app switcher"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            </div>

            {status === 'loading' && (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">Loading app access…</div>
            )}
            {status === 'error' && (
              <div className="px-3 py-2 text-xs text-red-600 dark:text-red-300">App access unavailable</div>
            )}
            {visibleApps.length === 0 && status === 'ready' && (
              <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{emptyLabel}</div>
            )}

            <div className={variant === 'compact' ? 'space-y-1' : 'grid grid-cols-3 gap-2'}>
              {visibleApps.map((app, index) => {
                const IconComponent = ICON_MAP[app.icon]
                const isCurrent = app.id === currentAppId
                const shortcut = app.shortcut || shortcutLabel(index)

                return (
                  <a
                    key={app.id}
                    ref={(node) => { itemRefs.current[index] = node }}
                    role="menuitem"
                    href={app.path}
                    onClick={(e) => handleAppClick(e, app)}
                    className={variant === 'compact'
                      ? `flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500 ${isCurrent ? 'bg-amber-50 font-medium text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700'}`
                      : `flex flex-col items-center gap-2 rounded-lg p-3 text-center transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-amber-500 dark:hover:bg-gray-700 ${isCurrent ? 'bg-gray-100 ring-2 ring-amber-500 dark:bg-gray-700' : ''}`
                    }
                  >
                    <div className={variant === 'compact' ? '' : `flex h-10 w-10 items-center justify-center rounded-lg ${app.bgColor} text-white`}>
                      {IconComponent && <IconComponent className={variant === 'compact' ? 'h-5 w-5 shrink-0' : 'h-5 w-5'} />}
                    </div>
                    <span className={variant === 'compact' ? 'min-w-0 flex-1 truncate font-semibold tracking-tight' : 'text-sm font-medium text-gray-900 dark:text-gray-100'}>
                      {app.name}
                    </span>
                    {variant === 'grid' && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">{app.description}</span>
                    )}
                    {showShortcuts && variant === 'compact' && (
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">{shortcut}</span>
                    )}
                    {isCurrent && variant === 'compact' && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </a>
                )
              })}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes shizuha-ui-fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default AppSwitcher
