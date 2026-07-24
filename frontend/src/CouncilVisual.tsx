import { motion, AnimatePresence } from 'motion/react'
import type { ChairResult, MemberResult, Critique, StageEvent } from './types'

interface Props {
  members: MemberResult[]
  chair: ChairResult | null
  critiques: Critique[] | null
  activeTab: string
  onTabChange: (id: string) => void
  stage?: StageEvent
  inProgress?: boolean
  mode?: 'council' | 'debate'
}

const MEMBER_COLORS = [
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', dot: 'bg-blue-400', ring: 'ring-blue-300' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-400', ring: 'ring-emerald-300' },
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', dot: 'bg-amber-400', ring: 'ring-amber-300' },
  { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', dot: 'bg-purple-400', ring: 'ring-purple-300' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800', dot: 'bg-rose-400', ring: 'ring-rose-300' },
]

function chairIcon(v: string): string {
  const lower = v.toLowerCase()
  if (lower.includes('revise') || lower.includes('reject') || lower.includes('flag')) return '\u26A0'
  if (lower.includes('accept') || lower.includes('approve') || lower.includes('pass')) return '\u2713'
  if (lower.includes('replace')) return '\u21BB'
  return '\u2696'
}

function getRoundLabel(stage?: StageEvent): string {
  if (!stage || stage.stage !== 'debate') return ''
  const roundLabels: Record<string, string> = {
    'round_1_reviews': 'Round 1: Independent Reviews',
    'round_2_critique': 'Round 2: Peer Critique',
    'round_3_revision': 'Round 3: Revision',
    'round_4_final_critique': 'Round 4: Final Critique',
    'chair_starting': 'Chair Synthesis',
  }
  return roundLabels[stage.status] || ''
}

function riskBadge(count: number): string {
  if (count === 0) return ''
  if (count <= 2) return '!'
  return '!!'
}

function confidenceColor(score: number): string {
  if (score >= 0.7) return 'text-green-600 bg-green-50'
  if (score >= 0.4) return 'text-yellow-600 bg-yellow-50'
  return 'text-red-600 bg-red-50'
}

export default function CouncilVisual({ members, chair, critiques, activeTab, onTabChange, stage, inProgress, mode = 'council' }: Props) {
  if (members.length === 0) return null

  const showChair = !!chair
  const mCount = members.length
  const mid = Math.ceil(mCount / 2)
  const isDebate = mode === 'debate'

  const chairNode = showChair ? (
    <motion.button
      onClick={() => onTabChange('chair')}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className={`relative flex flex-col items-center justify-center w-24 h-24 rounded-full
        bg-council-500 text-white shadow-md border-2 border-white transition-all
        ${activeTab === 'chair' ? 'ring-2 ring-council-300 scale-105' : ''}`}
      animate={activeTab === 'chair' ? { boxShadow: '0 0 20px rgba(100, 100, 255, 0.5)' } : {}}
      transition={{ duration: 1, repeat: Infinity }}
    >
      <span className="text-lg">{chairIcon(chair!.verdict)}</span>
      <span className="text-[9px] font-semibold mt-0.5 leading-tight text-center">Chair</span>
      <span className="text-[7px] opacity-80">synthesis</span>
      {inProgress && activeTab === 'chair' && (
        <motion.div className="absolute -inset-2 rounded-full border-2 border-council-300" animate={{ scale: [1, 1.3], opacity: [0.6, 0] }} transition={{ duration: 1.5, repeat: Infinity }} />
      )}
    </motion.button>
  ) : null

  const roundLabel = getRoundLabel(stage)

  return (
    <div className="py-4">
      {isDebate && roundLabel && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center text-xs font-medium text-council-600 mb-3 px-2"
          role="status"
          aria-live="polite"
        >
          {roundLabel} {stage?.round && stage?.total && <span className="text-gray-400">({stage.round}/{stage.total})</span>}
        </motion.div>
      )}

      <div className="relative max-w-md mx-auto">
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
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

          <AnimatePresence mode="popLayout">
            {members.slice(0, mid).map((m, i) => (
              <motion.div key={m.member_id} initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -20 }} transition={{ duration: 0.3, delay: i * 0.05 }}>
                <MemberSeat
                  member={m}
                  color={MEMBER_COLORS[i % MEMBER_COLORS.length]}
                  active={activeTab === m.member_id}
                  onClick={() => onTabChange(m.member_id)}
                  isStreaming={inProgress && !m.round}
                  round={m.round}
                />
              </motion.div>
            ))}
          </AnimatePresence>

          {showChair && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="w-full flex justify-center my-1">
              {chairNode}
            </motion.div>
          )}

          <AnimatePresence mode="popLayout">
            {members.slice(mid).map((m, i) => (
              <motion.div key={m.member_id} initial={{ opacity: 0, scale: 0.8, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.8, y: -20 }} transition={{ duration: 0.3, delay: (mid + i) * 0.05 }}>
                <MemberSeat
                  member={m}
                  color={MEMBER_COLORS[(mid + i) % MEMBER_COLORS.length]}
                  active={activeTab === m.member_id}
                  onClick={() => onTabChange(m.member_id)}
                  isStreaming={inProgress && !m.round}
                  round={m.round}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {isDebate && stage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mt-3 p-2 rounded-lg bg-gray-50 text-center text-[10px] text-gray-500"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-center gap-1">
              <span className="w-1.5 h-1.5 bg-council-400 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-council-400 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-council-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              <span className="ml-2">Processing round {stage.round} of {stage.total}...</span>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}

interface MemberSeatProps {
  member: MemberResult
  color: typeof MEMBER_COLORS[0]
  active: boolean
  onClick: () => void
  isStreaming?: boolean
  round?: number
}

function MemberSeat({ member, color, active, onClick, isStreaming, round }: MemberSeatProps) {
  const riskStr = riskBadge(member.risks.length)
  const isCurrentRound = round !== undefined

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: active ? 1.02 : 1.05 }}
      whileTap={{ scale: 0.98 }}
      className={`relative flex flex-col items-center px-3 py-2 rounded-xl border-2 transition-all
        ${color.bg} ${color.border}
        ${active ? `ring-2 ${color.ring} scale-105 shadow-md` : 'hover:scale-105 shadow-sm'}`}
      style={{ borderColor: active ? 'currentColor' : undefined }}
    >
      {riskStr && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -top-1.5 -right-1.5 text-[9px] bg-red-100 text-red-700 rounded-full px-1 font-medium"
        >
          {riskStr}
        </motion.span>
      )}

      <motion.div
        className={`w-2 h-2 rounded-full mb-1 ${color.dot}`}
        animate={isStreaming ? { scale: [1, 1.3, 1], opacity: [1, 0.4, 1] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      />

      {isCurrentRound && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute -top-1.5 -left-1.5 text-[8px] bg-council-500 text-white rounded-full px-1.5 py-0.5 font-bold"
        >
          R{round}
        </motion.span>
      )}

      <motion.span
        className={`text-[10px] font-semibold leading-tight text-center ${color.text}`}
        animate={active ? { fontSize: ['10px', '11px', '10px'] } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      >
        {member.role}
      </motion.span>

      <motion.span
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={`text-[8px] font-medium px-1 rounded mt-0.5 ${confidenceColor(member.confidence)}`}
      >
        {Math.round(member.confidence * 100)}%
      </motion.span>
    </motion.button>
  )
}