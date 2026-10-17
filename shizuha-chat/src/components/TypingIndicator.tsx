// TypingIndicator component

interface TypingIndicatorProps {
  names: string[]
}

export function TypingIndicator({ names }: TypingIndicatorProps) {
  if (names.length === 0) return null

  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
        ? `${names[0]} and ${names[1]} are typing`
        : `${names[0]} and ${names.length - 1} others are typing`

  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-xs text-zinc-400 dark:text-zinc-500">{text}</span>
    </div>
  )
}
