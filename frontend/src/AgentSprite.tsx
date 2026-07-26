import { motion } from 'motion/react'
import type { SpriteState } from './types'

interface Props {
  role: string
  size?: number
  state?: SpriteState
  /** -1 faces left, 1 faces right, 0 faces forward. Used to turn toward the speaker. */
  facing?: number
  seed?: number
}

export interface RoleTheme {
  base: string
  dark: string
  light: string
  initial: string
}

const THEMES: Array<[string, RoleTheme]> = [
  ['Chair', { base: '#2563eb', dark: '#1d4ed8', light: '#dbeafe', initial: 'C' }],
  ['Scientific Verifier', { base: '#0891b2', dark: '#0e7490', light: '#cffafe', initial: 'V' }],
  ['Scientific', { base: '#2563eb', dark: '#1e40af', light: '#dbeafe', initial: 'S' }],
  ['Skeptical', { base: '#d97706', dark: '#b45309', light: '#fef3c7', initial: 'R' }],
  ['Argument', { base: '#059669', dark: '#047857', light: '#d1fae5', initial: 'A' }],
  ['Language', { base: '#7c3aed', dark: '#6d28d9', light: '#ede9fe', initial: 'L' }],
]

const FALLBACK: RoleTheme = { base: '#6b7280', dark: '#4b5563', light: '#f3f4f6', initial: '?' }

export function themeFor(role: string): RoleTheme {
  for (const [key, theme] of THEMES) {
    if (role.includes(key)) return theme
  }
  if (!role) return FALLBACK
  return { ...FALLBACK, initial: role.trim()[0].toUpperCase() }
}

/** Body bob: alive when working, still when queued or finished. */
function bodyMotion(state: SpriteState) {
  switch (state) {
    case 'thinking':
      return { animate: { y: [0, -1.5, 0] }, transition: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' as const } }
    case 'speaking':
      return { animate: { y: [0, -2.5, 0] }, transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' as const } }
    case 'error':
      return { animate: { x: [0, -1, 1, 0] }, transition: { duration: 0.4, repeat: 2 } }
    default:
      return { animate: { y: 0 }, transition: { duration: 0.3 } }
  }
}

export default function AgentSprite({ role, size = 44, state = 'idle', facing = 0, seed = 0 }: Props) {
  const t = themeFor(role)
  const uid = `${role.replace(/\W/g, '')}-${seed}`
  const dim = state === 'queued'
  const bob = bodyMotion(state)

  // Pupils shift toward whoever is talking; eyes narrow while thinking.
  const gaze = facing * 1.6
  const eyeOpen = state === 'thinking' ? 1.7 : 2.4

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${role || 'Reviewer'}, ${state}`}
      style={{ opacity: dim ? 0.4 : 1, overflow: 'visible' }}
      animate={bob.animate}
      transition={bob.transition}
    >
      <defs>
        <linearGradient id={`body-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={t.base} />
          <stop offset="100%" stopColor={t.dark} />
        </linearGradient>
      </defs>

      {/* Halo pulses only while this agent is actively producing text. */}
      {(state === 'speaking' || state === 'thinking') && (
        <circle cx="24" cy="24" r="21" fill="none" stroke={t.base} strokeWidth="1.5" opacity="0.35">
          <animate attributeName="r" values="19;23;19" dur={state === 'speaking' ? '1.2s' : '2.2s'} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.35;0;0.35" dur={state === 'speaking' ? '1.2s' : '2.2s'} repeatCount="indefinite" />
        </circle>
      )}

      {/* Shoulders */}
      <path d="M10 44 Q10 33 24 33 Q38 33 38 44 Z" fill={`url(#body-${uid})`} />

      {/* Head */}
      <circle cx="24" cy="19" r="13" fill={`url(#body-${uid})`} />
      <circle cx="24" cy="19" r="13" fill="none" stroke={t.dark} strokeWidth="1" opacity="0.5" />

      {/* Chair wears a laurel; everyone else gets a role initial on the chest. */}
      {role.includes('Chair') ? (
        <path d="M14 11 Q24 4 34 11" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <text x="24" y="40" textAnchor="middle" fill="white" fontSize="7" fontWeight="700" opacity="0.75" fontFamily="ui-sans-serif, system-ui">
          {t.initial}
        </text>
      )}

      {/* Eyes — blink on a loop offset per seat so the table isn't synchronised */}
      <g transform={`translate(${gaze} 0)`}>
        <ellipse cx="19" cy="18" rx="2.6" ry={eyeOpen} fill="white">
          <animate attributeName="ry" values={`${eyeOpen};0.3;${eyeOpen}`} keyTimes="0;0.5;1" dur="0.18s" begin={`${2 + seed * 1.3}s;blink${uid}.end+${3 + seed}s`} id={`blink${uid}`} />
        </ellipse>
        <ellipse cx="29" cy="18" rx="2.6" ry={eyeOpen} fill="white">
          <animate attributeName="ry" values={`${eyeOpen};0.3;${eyeOpen}`} keyTimes="0;0.5;1" dur="0.18s" begin={`${2 + seed * 1.3}s;blink${uid}.end+${3 + seed}s`} />
        </ellipse>
        <circle cx={19 + gaze * 0.3} cy="18" r="1.2" fill={t.dark} />
        <circle cx={29 + gaze * 0.3} cy="18" r="1.2" fill={t.dark} />
      </g>

      {/* Mouth carries the state: flat when idle, open when speaking, frown on error */}
      {state === 'speaking' ? (
        <ellipse cx="24" cy="25" rx="3" ry="2" fill={t.dark} opacity="0.85">
          <animate attributeName="ry" values="1;2.6;1" dur="0.45s" repeatCount="indefinite" />
        </ellipse>
      ) : state === 'error' ? (
        <path d="M20 26 Q24 23 28 26" fill="none" stroke={t.dark} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      ) : state === 'done' ? (
        <path d="M20 24 Q24 27.5 28 24" fill="none" stroke={t.dark} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      ) : (
        <line x1="21" y1="25" x2="27" y2="25" stroke={t.dark} strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      )}

      {/* Status pip, bottom-right */}
      {state === 'done' && (
        <g>
          <circle cx="38" cy="38" r="7" fill="#16a34a" stroke="white" strokeWidth="1.5" />
          <path d="M35 38 l2 2 l4 -4.5" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {state === 'error' && (
        <g>
          <circle cx="38" cy="38" r="7" fill="#dc2626" stroke="white" strokeWidth="1.5" />
          <path d="M38 34.5 v4 M38 41 v0.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      )}
      {state === 'thinking' && (
        <g>
          <circle cx="38" cy="38" r="7" fill="white" stroke={t.base} strokeWidth="1.5" />
          {[0, 1, 2].map(i => (
            <circle key={i} cx={35.5 + i * 2.5} cy="38" r="0.9" fill={t.base}>
              <animate attributeName="opacity" values="0.25;1;0.25" dur="1.1s" begin={`${i * 0.18}s`} repeatCount="indefinite" />
            </circle>
          ))}
        </g>
      )}
    </motion.svg>
  )
}
