interface AvatarProps {
  name: string
  size?: 'sm' | 'md' | 'lg'
  isOnline?: boolean
  showStatus?: boolean
}

const COLORS = [
  'bg-blue-600', 'bg-purple-600', 'bg-emerald-600', 'bg-rose-600',
  'bg-amber-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-teal-600',
  'bg-pink-600', 'bg-violet-600', 'bg-orange-600', 'bg-lime-600',
]

function hashColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return COLORS[Math.abs(hash) % COLORS.length]!
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

const SIZES = {
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-10 h-10 text-sm',
}

export function Avatar({ name, size = 'md', isOnline, showStatus = false }: AvatarProps) {
  const color = hashColor(name)
  const initials = getInitials(name)
  const sizeClass = SIZES[size]

  return (
    <div className="relative flex-shrink-0">
      <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center text-white font-semibold shadow-sm`}>
        {initials}
      </div>
      {showStatus && (
        <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white dark:border-gray-950 ${
          isOnline ? 'bg-green-500' : 'bg-gray-400'
        }`} />
      )}
    </div>
  )
}

export { hashColor, getInitials }
