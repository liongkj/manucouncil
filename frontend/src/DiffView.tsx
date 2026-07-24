import { useMemo, useState } from 'react'
import { diffWords, extractChanges, type DiffSegment, type ChangeGroup } from './diff'

interface Props {
  original: string
  revised: string
  rationale: string
}

export default function DiffView({ original, revised, rationale }: Props) {
  const segments = useMemo(() => diffWords(original, revised), [original, revised])
  const changes = useMemo(() => extractChanges(original, revised, rationale), [original, revised, rationale])
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
          Revision diff
        </div>
        <div className="p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
          {segments.map((seg, i) => {
            if (seg.type === 'same') {
              return <span key={i} className="text-gray-800">{seg.text}</span>
            }
            const changeIdx = changes.findIndex(c =>
              seg.type === 'removed' ? c.oldText.includes(seg.text.trim()) : c.newText.includes(seg.text.trim())
            )
            const isHovered = changeIdx !== -1 && hoveredIdx === changeIdx

            if (seg.type === 'removed') {
              return (
                <span
                  key={i}
                  className="relative bg-red-100 text-red-800 rounded cursor-help transition-colors"
                  onMouseEnter={() => setHoveredIdx(changeIdx >= 0 ? changeIdx : null)}
                  onMouseLeave={() => setHoveredIdx(null)}
                >
                  <span className="line-through decoration-red-500 decoration-1">{seg.text}</span>
                  {isHovered && changeIdx >= 0 && changeIdx < changes.length && (
                    <span className="absolute bottom-full left-0 mb-1 w-64 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg z-10 whitespace-normal font-sans">
                      {changes[changeIdx].reason}
                    </span>
                  )}
                </span>
              )
            }

            return (
              <span
                key={i}
                className="relative bg-green-100 text-green-800 rounded cursor-help transition-colors"
                onMouseEnter={() => setHoveredIdx(changeIdx >= 0 ? changeIdx : null)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <span className="font-medium">{seg.text}</span>
                {isHovered && changeIdx >= 0 && changeIdx < changes.length && (
                  <span className="absolute bottom-full left-0 mb-1 w-64 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg z-10 whitespace-normal font-sans">
                    {changes[changeIdx].reason}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      </div>

      {changes.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-gray-50 px-3 py-1.5 text-[10px] font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">
            Changes ({changes.length})
          </div>
          <div className="divide-y divide-gray-100">
            {changes.map((c, i) => (
              <div
                key={i}
                className="px-3 py-2 space-y-1"
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="text-[11px] text-red-700 line-through leading-tight truncate" title={c.oldText}>
                      {c.oldText.trim() || '\u00A0'}
                    </div>
                    <div className="text-[11px] text-green-700 font-medium leading-tight truncate" title={c.newText}>
                      {c.newText.trim() || '\u00A0'}
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500 leading-snug">
                  {c.reason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
