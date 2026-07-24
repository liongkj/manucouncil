import { useState, useEffect, useRef } from 'react'

interface DebugEntry {
  timestamp: string
  type: string
  [key: string]: unknown
}

interface Props {
  sessionId: string | null
  onClose: () => void
}

export default function DebugPanel({ sessionId, onClose }: Props) {
  const [entries, setEntries] = useState<DebugEntry[]>([])
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId) return
    fetch(`/api/debug/logs/${sessionId}`)
      .then(r => r.json())
      .then(data => setEntries(data))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    if (!autoRefresh || !sessionId) return
    const interval = setInterval(() => {
      fetch(`/api/debug/logs/${sessionId}`)
        .then(r => r.json())
        .then(data => setEntries(data))
        .catch(() => {})
    }, 2000)
    return () => clearInterval(interval)
  }, [autoRefresh, sessionId])

  useEffect(() => {
    if (autoRefresh) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [entries, autoRefresh])

  const toggleEntry = (i: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const typeColor = (type: string) => {
    if (type.includes('error')) return 'text-red-600'
    if (type.includes('complete') || type === 'chat_complete' || type === 'council_complete') return 'text-green-600'
    if (type.includes('bridge_call')) return 'text-blue-600'
    if (type.includes('council_start') || type === 'chat_start') return 'text-purple-600'
    return 'text-gray-600'
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-gray-50 border-l border-gray-200 shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">Debug Log</h2>
            <span className="text-[10px] text-gray-400 font-mono">
              {sessionId ? sessionId.slice(0, 8) + '...' : 'no session'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={e => setAutoRefresh(e.target.checked)}
                className="w-3 h-3"
              />
              Auto-refresh
            </label>
            <span className="text-[10px] text-gray-400">{entries.length} entries</span>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]">
          {entries.length === 0 && (
            <div className="text-gray-400 text-center py-8">No debug entries yet</div>
          )}
          {entries.map((entry, i) => {
            const isExpanded = expanded.has(i)
            const summary = entry.type
            const time = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : ''
            return (
              <div key={i} className="border border-gray-200 rounded bg-white">
                <button
                  onClick={() => toggleEntry(i)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-gray-50"
                >
                  <span className="text-gray-300 text-[9px] w-6 shrink-0">{time}</span>
                  <span className={`font-medium ${typeColor(summary)}`}>{summary}</span>
                  <span className="ml-auto text-gray-300 text-[9px]">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </button>
                {isExpanded && (
                  <pre className="px-2 pb-2 text-[10px] text-gray-600 overflow-x-auto whitespace-pre-wrap break-all max-h-96 overflow-y-auto">
                    {JSON.stringify(entry, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  )
}
