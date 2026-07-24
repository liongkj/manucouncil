interface Props {
  value: string
  onChange: (v: string) => void
  visible: boolean
  onToggle: () => void
}

export default function Scratchpad({ value, onChange, visible, onToggle }: Props) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="12" height="12" rx="2" />
            <line x1="5" y1="6" x2="11" y2="6" />
            <line x1="5" y1="8.5" x2="9" y2="8.5" />
          </svg>
          Council Scratchpad
        </span>
        <span className="text-gray-400 text-[10px]">{visible ? 'hide' : 'show'}</span>
      </button>
      {visible && (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Shared notes visible to all council members. Use this to provide context, specify criteria, or note observations for reviewers to consider."
          rows={3}
          className="w-full resize-none border-0 border-t border-gray-100 px-3 py-2 text-xs text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-0"
        />
      )}
    </div>
  )
}
