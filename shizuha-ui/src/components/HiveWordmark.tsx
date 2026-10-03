/**
 * HiveWordmark — lowercase 'hive' logotype + hex mark
 *
 * Cross-surface brand identity component. Light/dark aware via CSS
 * currentColor and a `dark` class on the parent.
 *
 * @example
 * ```tsx
 * import { HiveWordmark } from '@shizuha/ui'
 *
 * <HiveWordmark size="sm" />
 * <HiveWordmark size="lg" showSubtitle />
 * <HiveWordmark markOnly />
 * <HiveWordmark textOnly />
 * ```
 */

import type { HiveWordmarkProps } from '../types'

interface SizeConfig {
  mark: number
  fontSize: string
  gap: string
}

const SIZES: Record<NonNullable<HiveWordmarkProps['size']>, SizeConfig> = {
  sm: { mark: 20, fontSize: 'text-sm', gap: 'gap-1.5' },
  md: { mark: 28, fontSize: 'text-base', gap: 'gap-2' },
  lg: { mark: 36, fontSize: 'text-xl', gap: 'gap-2.5' },
}

function HexMark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden="true"
    >
      {/* Hexagon outline */}
      <path
        d="M16 2L28 9.5V22.5L16 30L4 22.5V9.5L16 2Z"
        className="stroke-amber-500 dark:stroke-amber-400"
        strokeWidth="2"
        fill="none"
      />
      {/* Inner hexagon (honeycomb cell) */}
      <path
        d="M16 8L23 12.5V19.5L16 24L9 19.5V12.5L16 8Z"
        className="fill-amber-500/20 dark:fill-amber-400/20 stroke-amber-500 dark:stroke-amber-400"
        strokeWidth="1.5"
      />
      {/* Center dot */}
      <circle
        cx="16"
        cy="16"
        r="2.5"
        className="fill-amber-500 dark:fill-amber-400"
      />
    </svg>
  )
}

export default function HiveWordmark({
  size = 'md',
  markOnly = false,
  textOnly = false,
  showSubtitle = false,
  className = '',
}: HiveWordmarkProps) {
  const s = SIZES[size] || SIZES.md

  return (
    <div className={`flex items-center ${s.gap} ${className}`}>
      {!textOnly && <HexMark size={s.mark} />}

      {!markOnly && (
        <div className="flex flex-col leading-none">
          <span
            className={`font-semibold tracking-tight text-gray-900 dark:text-white ${s.fontSize}`}
            style={{ letterSpacing: '-0.02em' }}
          >
            hive
          </span>
          {showSubtitle && (
            <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              Agent Home
            </span>
          )}
        </div>
      )}
    </div>
  )
}