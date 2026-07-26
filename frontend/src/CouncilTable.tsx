import { motion, AnimatePresence } from 'motion/react'
import AgentSprite, { themeFor } from './AgentSprite'
import type { ChairResult, ChairStatus, Critique, MemberResult, MemberStatus, PhaseKey, SpriteState } from './types'
import { PHASE_LABELS } from './types'

interface Props {
  members: MemberResult[]
  critiques: Critique[] | null
  chair: ChairResult | null
  chairStatus?: ChairStatus
  phase: PhaseKey | null
  activeMemberId?: string | null
  inProgress?: boolean
  round?: number
}

interface Point {
  x: number
  y: number
}

interface Seat {
  id: string
  role: string
  pos: Point
  state: SpriteState
  seed: number
}

interface CritiqueArc {
  key: string
  from: Point
  to: Point
  cp: Point
  color: string
  animated: boolean
}

// Table geometry, in the shared "0 0 100 75" viewBox.
const TABLE_CX = 50
const TABLE_CY = 42
const TABLE_RX = 34
const TABLE_RY = 24
const CHAIR_POS: Point = { x: 50, y: 18 }

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function memberAngle(i: number, n: number): number {
  const spread = Math.min(140, 55 * (n - 1))
  const start = 90 + spread / 2
  return n === 1 ? 90 : start - (i * spread) / (n - 1)
}

function memberPos(i: number, n: number): Point {
  const a = toRad(memberAngle(i, n))
  return { x: TABLE_CX + TABLE_RX * Math.cos(a), y: TABLE_CY + TABLE_RY * Math.sin(a) }
}

function statusOrDefault(status: MemberStatus | undefined, analysis: string): MemberStatus {
  if (status) return status
  return analysis ? 'done' : 'queued'
}

function excerpt(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

/** Every label a critique touches (rankings + strongest points + weaknesses), resolved to member ids. */
function resolvePeerIds(critique: Critique): string[] {
  const labelMap = critique.label_map
  if (!labelMap) return []
  const labels = new Set<string>()
  critique.rankings.forEach(l => labels.add(l))
  Object.keys(critique.strongest_points).forEach(l => labels.add(l))
  Object.keys(critique.weaknesses).forEach(l => labels.add(l))
  const ids: string[] = []
  labels.forEach(label => {
    const id = labelMap[label]
    if (id && id !== critique.reviewer_id) ids.push(id)
  })
  return ids
}

interface SeatNodeProps {
  seat: Seat
  facing: number
  size: number
  labelWidth: number
}

function SeatNode({ seat, facing, size, labelWidth }: SeatNodeProps) {
  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        left: `${seat.pos.x}%`,
        top: `${(seat.pos.y / 75) * 100}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <AgentSprite role={seat.role} size={size} state={seat.state} facing={facing} seed={seat.seed} />
      <span
        className="mt-0.5 text-[8px] font-medium leading-tight text-council-800 text-center truncate"
        style={{ maxWidth: `${labelWidth}px` }}
        title={seat.role}
      >
        {seat.role}
      </span>
    </div>
  )
}

export default function CouncilTable({ members, critiques, chair, chairStatus, phase, activeMemberId, inProgress, round }: Props) {
  if (members.length === 0) return null

  const n = members.length
  const effectiveChairStatus: ChairStatus = chairStatus ?? (chair ? 'done' : 'idle')
  const showChairSeat = chair !== null || effectiveChairStatus !== 'idle'

  const activeMember = activeMemberId ? members.find(m => m.member_id === activeMemberId) : undefined
  const isSpeaking = !!activeMember && statusOrDefault(activeMember.status, activeMember.analysis) === 'thinking'
  const speakerPos = isSpeaking && activeMember ? memberPos(members.indexOf(activeMember), n) : null

  const memberSeats: Seat[] = members.map((m, i) => {
    const status = statusOrDefault(m.status, m.analysis)
    let state: SpriteState
    if (status === 'queued') state = 'queued'
    else if (status === 'error') state = 'error'
    else if (m.member_id === activeMemberId && status === 'thinking') state = 'speaking'
    else if (status === 'thinking') state = 'thinking'
    else if (status === 'done') state = speakerPos ? 'listening' : 'done'
    else state = 'idle'

    return { id: m.member_id, role: m.role, pos: memberPos(i, n), state, seed: i }
  })

  const chairSeat: Seat | null = showChairSeat
    ? (() => {
        let state: SpriteState = effectiveChairStatus
        if (effectiveChairStatus === 'done' && speakerPos) state = 'listening'
        return { id: '__chair__', role: 'Chair', pos: CHAIR_POS, state, seed: n }
      })()
    : null

  const allSeats = chairSeat ? [chairSeat, ...memberSeats] : memberSeats

  function facingFor(seat: Seat): number {
    if (!speakerPos || seat.id === activeMemberId) return 0
    return Math.sign(speakerPos.x - seat.pos.x)
  }

  // Critique arcs: reviewer seat -> each peer they critiqued, resolved via label_map.
  const positionsById = new Map<string, Point>()
  memberSeats.forEach(s => positionsById.set(s.id, s.pos))

  const showArcs = !!critiques && critiques.length > 0
  const maxRound = critiques && critiques.length > 0 ? Math.max(...critiques.map(c => c.round ?? 0)) : 0

  const arcs: CritiqueArc[] = showArcs && critiques
    ? critiques.flatMap(c => {
        const from = positionsById.get(c.reviewer_id)
        if (!from) return []
        const reviewerRole = members.find(m => m.member_id === c.reviewer_id)?.role ?? ''
        const color = themeFor(reviewerRole).base
        const animated = (c.round ?? 0) === maxRound
        return resolvePeerIds(c).flatMap((peerId, pi): CritiqueArc[] => {
          const to = positionsById.get(peerId)
          if (!to) return []
          const mid: Point = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
          const cp: Point = {
            x: mid.x + (TABLE_CX - mid.x) * 0.45,
            y: mid.y + (TABLE_CY - mid.y) * 0.45,
          }
          return [{ key: `${c.reviewer_id}-${peerId}-${c.round ?? 0}-${pi}`, from, to, cp, color, animated }]
        })
      })
    : []

  // Seats crowd together as the council grows; shrink sprites and labels to match
  // the horizontal gap between adjacent seats so role names never collide.
  const seatSize = n >= 5 ? 32 : n === 4 ? 36 : 40
  const chairSize = n >= 5 ? 40 : 48
  const labelWidth = n >= 5 ? 46 : n === 4 ? 56 : 72

  const phaseLabel = phase ? PHASE_LABELS[phase] : null
  const speakerRole = activeMember?.role ?? null
  const liveMessage = [
    phaseLabel ? `Phase: ${phaseLabel}.` : null,
    round ? `Round ${round}.` : null,
    speakerRole ? `${speakerRole} is speaking.` : inProgress ? 'Council is working.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className="relative w-full max-w-md mx-auto aspect-[4/3]">
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 75"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <ellipse
          cx={TABLE_CX}
          cy={TABLE_CY}
          rx={TABLE_RX}
          ry={TABLE_RY}
          fill="#e0ebff"
          fillOpacity="0.5"
          stroke="#7cb4fc"
          strokeWidth="0.6"
        />
        {arcs.map(arc => (
          <path
            key={arc.key}
            d={`M ${arc.from.x} ${arc.from.y} Q ${arc.cp.x} ${arc.cp.y} ${arc.to.x} ${arc.to.y}`}
            fill="none"
            stroke={arc.color}
            strokeWidth={arc.animated ? 0.6 : 0.4}
            strokeLinecap="round"
            opacity={arc.animated ? 0.85 : 0.25}
            strokeDasharray={arc.animated ? '3 2.5' : undefined}
          >
            {arc.animated && (
              <animate attributeName="stroke-dashoffset" values="0;-11" dur="0.7s" repeatCount="indefinite" />
            )}
          </path>
        ))}
      </svg>

      {allSeats.map(seat => (
        <SeatNode
          key={seat.id}
          seat={seat}
          facing={facingFor(seat)}
          size={seat.id === '__chair__' ? chairSize : seatSize}
          labelWidth={seat.id === '__chair__' ? 72 : labelWidth}
        />
      ))}

      <AnimatePresence>
        {isSpeaking && activeMember && speakerPos && (
          <motion.div
            key={activeMember.member_id}
            initial={{ opacity: 0, y: 4, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="absolute z-10 max-w-[10rem] rounded-lg bg-white border border-council-200 shadow-md px-2 py-1"
            style={{
              left: `${speakerPos.x}%`,
              top: `${((speakerPos.y - 13) / 75) * 100}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <p className="text-[9px] leading-snug text-council-800 whitespace-nowrap overflow-hidden text-ellipsis">
              {excerpt(activeMember.analysis || '…')}
            </p>
            <div
              className="absolute left-1/2 -bottom-1 w-2 h-2 bg-white border-r border-b border-council-200"
              style={{ transform: 'translateX(-50%) rotate(45deg)' }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>
    </div>
  )
}
