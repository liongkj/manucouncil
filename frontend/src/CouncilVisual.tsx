import type { ChairResult, MemberResult, Critique } from './types'

interface Props {
  members: MemberResult[]
  chair: ChairResult | null
  critiques: Critique[] | null
  activeTab: string
  onTabChange: (id: string) => void
}

const MEMBER_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-400' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-400' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', dot: 'bg-amber-400' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-400' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', dot: 'bg-rose-400' },
]

function chairIcon(v: string): string {
  const lower = v.toLowerCase()
  if (lower.includes('revise') || lower.includes('reject') || lower.includes('flag')) return '\u26A0'
  if (lower.includes('accept') || lower.includes('approve') || lower.includes('pass')) return '\u2713'
  if (lower.includes('replace')) return '\u21BB'
  return '\u2696'
}

export default function CouncilVisual({ members, chair, critiques, activeTab, onTabChange }: Props) {
  if (members.length === 0) return null

  const showChair = !!chair
  const mCount = members.length
  const mid = Math.ceil(mCount / 2)

  const chairNode = showChair ? (
    <button
      onClick={() => onTabChange('chair')}
      className={`relative flex flex-col items-center justify-center w-24 h-24 rounded-full
        bg-council-500 text-white shadow-md border-2 border-white transition-all
        ${activeTab === 'chair' ? 'ring-2 ring-council-300 scale-105' : 'hover:scale-105'}`}
    >
      <span className="text-lg">{chairIcon(chair!.verdict)}</span>
      <span className="text-[9px] font-semibold mt-0.5 leading-tight text-center">Chair</span>
      <span className="text-[7px] opacity-80">synthesis</span>
    </button>
  ) : null

  return (
    <div className="py-4">
      <div className="relative max-w-md mx-auto">
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
          {members.map((_, i) => {
            const angle = (i / members.length) * Math.PI
            const x1 = 50 + Math.cos(angle) * 30
            const y1 = 50 + Math.sin(angle) * 30 - (members.length <= 2 ? 0 : 10)
            return (
              <line key={i} x1={50} y1={50} x2={x1} y2={y1}
                stroke="currentColor" strokeWidth="0.5" strokeDasharray="2,2" />
            )
          })}
        </svg>

        <div className={`relative flex flex-wrap justify-center items-center gap-3 ${mCount > 4 ? 'px-4' : ''}`}
          style={{ paddingTop: showChair ? '0.5rem' : '0', paddingBottom: '0.5rem' }}>

          {members.slice(0, mid).map((m, i) => (
            <MemberSeat
              key={m.member_id}
              member={m}
              color={MEMBER_COLORS[i % MEMBER_COLORS.length]}
              active={activeTab === m.member_id}
              onClick={() => onTabChange(m.member_id)}
            />
          ))}

          {showChair && (
            <div className="w-full flex justify-center my-1">
              {chairNode}
            </div>
          )}

          {members.slice(mid).map((m, i) => (
            <MemberSeat
              key={m.member_id}
              member={m}
              color={MEMBER_COLORS[(mid + i) % MEMBER_COLORS.length]}
              active={activeTab === m.member_id}
              onClick={() => onTabChange(m.member_id)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function MemberSeat({ member, color, active, onClick }: {
  member: MemberResult
  color: typeof MEMBER_COLORS[0]
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center px-3 py-2 rounded-xl border-2 transition-all
        ${color.bg} ${color.border}
        ${active ? 'ring-2 ring-council-300 scale-105 shadow-md' : 'hover:scale-105 shadow-sm'}`}
    >
      <div className={`w-2 h-2 rounded-full mb-1 ${color.dot}`} />
      <span className={`text-[10px] font-semibold leading-tight text-center ${color.text}`}>{member.role}</span>
    </button>
  )
}
