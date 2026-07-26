import type { PhaseKey } from './types'
import { PHASE_LABELS } from './types'

interface Props {
  phases: PhaseKey[]
  current: PhaseKey | null
  round?: number
}

/** Compact horizontal pipeline stepper: done phases checked, current highlighted, rest dim. */
export default function PhaseStepper({ phases, current, round }: Props) {
  const currentIndex = current ? phases.indexOf(current) : -1

  return (
    <div className="flex flex-wrap items-center gap-y-1.5 max-w-full">
      {phases.map((phase, i) => {
        const isDone = currentIndex >= 0 && i < currentIndex
        const isCurrent = i === currentIndex

        return (
          <div key={phase} className="flex items-center">
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition-colors ${
                isCurrent
                  ? 'bg-council-100 text-council-700 ring-1 ring-council-300'
                  : isDone
                  ? 'bg-green-50 text-green-600'
                  : 'bg-gray-50 text-gray-400'
              }`}
            >
              {isDone ? (
                <svg className="w-2.5 h-2.5 shrink-0" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7l3 3 5-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isCurrent ? 'bg-council-500 animate-pulse' : 'bg-gray-300'}`} />
              )}
              <span>
                {PHASE_LABELS[phase]}
                {isCurrent && round ? ` · R${round}` : ''}
              </span>
            </div>
            {i < phases.length - 1 && (
              <span className={`w-3 h-px shrink-0 mx-0.5 ${isDone ? 'bg-green-300' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
