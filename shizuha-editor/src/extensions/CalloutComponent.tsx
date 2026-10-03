import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { Info, FileText, Lightbulb, AlertTriangle, XCircle, type LucideIcon } from 'lucide-react'
import { CALLOUT_TYPES, type CalloutType } from './Callout'

const ICONS: Record<CalloutType, LucideIcon> = {
  info: Info,
  note: FileText,
  tip: Lightbulb,
  warning: AlertTriangle,
  error: XCircle,
}

interface CalloutComponentProps {
  node: {
    attrs: {
      type?: CalloutType
    }
  }
  updateAttributes: (attrs: Record<string, unknown>) => void
}

export default function CalloutComponent({ node }: CalloutComponentProps) {
  const type = (node.attrs.type || 'info') as CalloutType
  const config = CALLOUT_TYPES[type] || CALLOUT_TYPES.info
  const Icon = ICONS[type] || Info

  return (
    <NodeViewWrapper className="callout-wrapper">
      <div
        className={`callout callout-${type} ${config.bgClass} border-l-4 ${config.borderClass} rounded-r-lg p-4 my-4`}
        data-callout=""
        data-callout-type={type}
      >
        <div className="flex gap-3">
          <div className={`flex-shrink-0 mt-0.5 ${config.iconClass}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 callout-content">
            <NodeViewContent />
          </div>
        </div>
      </div>
    </NodeViewWrapper>
  )
}
