import { useEffect, useMemo, useRef } from 'react'
import type { MemberResult, Critique, ChairResult, MemberStatus, SpriteState, PhaseKey } from './types'
import { COUNCIL_PHASES, DEBATE_PHASES } from './types'
import AgentSprite from './AgentSprite'
import PhaseStepper from './PhaseStepper'
import { cleanResponse, excerpt } from './utils'

interface Props {
  members: MemberResult[]
  critiques: Critique[] | null
  chair: ChairResult | null
  inProgress?: boolean
  mode?: 'council' | 'debate'
  currentRound?: number
  currentPhase?: PhaseKey | null
}

/** Live-streamed reasoning text captured per member while status was 'thinking', so it survives into the collapsed "show thinking" disclosure once the member finishes. */
function useReasoningTraces(members: MemberResult[]): Record<string, string> {
  const traces = useRef<Record<string, string>>({})
  useEffect(() => {
    for (const m of members) {
      if (m.status === 'thinking' && m.analysis) {
        traces.current[m.member_id] = m.analysis
      }
    }
  }, [members])
  return traces.current
}

function spriteStateFor(status: MemberStatus | undefined): SpriteState {
  switch (status) {
    case 'queued': return 'queued'
    case 'thinking': return 'thinking'
    case 'error': return 'error'
    default: return 'done'
  }
}

export default function CouncilDiscussion({ members, critiques, chair, inProgress, mode = 'council', currentRound, currentPhase }: Props) {
  const critiqueList = critiques || []
  const hasChair = !!chair
  const allDone = !inProgress
  const reasoningTraces = useReasoningTraces(members)

  const isDebate = mode === 'debate'
  const roundLabels: Record<number, string> = {
    1: 'Round 1: Independent Reviews',
    2: 'Round 2: Peer Critique',
    3: 'Round 3: Revision',
    4: 'Round 4: Final Critique',
    5: 'Chair Synthesis',
  }

  const phaseStepper = inProgress && (
    <PhaseStepper
      phases={isDebate ? DEBATE_PHASES : COUNCIL_PHASES}
      current={currentPhase ?? null}
      round={currentRound}
    />
  )

  if (isDebate && currentRound) {
    return (
      <div className="space-y-5">
        {phaseStepper}

        <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
          <span>Council Discussion</span>
          <span className="px-2 py-0.5 bg-council-100 text-council-700 rounded">
            {roundLabels[currentRound] || `Round ${currentRound}`}
          </span>
        </div>

        <DebateRoundView
          members={members}
          critiques={critiqueList}
          chair={chair}
          currentRound={currentRound}
          inProgress={inProgress === true}
          allDone={allDone}
          reasoningTraces={reasoningTraces}
        />

        {hasChair && chair && currentRound >= 5 && (
          <div className="animate-fade-in-up border-t border-gray-100 pt-4 mt-4" style={{ animationDelay: '200ms' }}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                <AgentSprite role="Chair" state="done" />
                <span className="text-[9px] font-semibold text-council-700 leading-tight text-center">Chair</span>
              </div>
              <div className="flex-1 min-w-0">
                <ChairBubble chair={chair} />
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {phaseStepper}

      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
        Council Discussion
      </div>

      <div className="space-y-4">
        {members.map((m, i) => {
          const c = critiqueList.find(cr => cr.reviewer_id === m.member_id)
          return (
            <div key={m.member_id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                  <AgentSprite role={m.role} state={spriteStateFor(m.status)} />
                  <span className="text-[9px] font-medium text-gray-500 leading-tight text-center">{m.role}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <MemberBubble
                    member={m}
                    reasoningTrace={reasoningTraces[m.member_id]}
                    newArrival={inProgress && i === members.length - 1}
                  />
                  {c && (
                    <div className="mt-2 ml-2">
                      <CritiqueBubble critique={c} allMembers={members} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {hasChair && chair && (
        <div className="animate-fade-in-up border-t border-gray-100 pt-4 mt-4" style={{ animationDelay: '200ms' }}>
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
              <AgentSprite role="Chair" state="done" />
              <span className="text-[9px] font-semibold text-council-700 leading-tight text-center">Chair</span>
            </div>
            <div className="flex-1 min-w-0">
              <ChairBubble chair={chair} />
            </div>
          </div>
        </div>
      )}

      {!hasChair && inProgress && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <div className="flex items-start gap-3 opacity-60">
            <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
              <AgentSprite role="Chair" state="thinking" />
              <span className="text-[9px] font-semibold text-council-700 leading-tight text-center">Chair</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-400 italic">
                Waiting for chair synthesis...
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DebateRoundView({ members, critiques, chair, currentRound, inProgress = false, allDone, reasoningTraces }: {
  members: MemberResult[]
  critiques: Critique[]
  chair: ChairResult | null
  currentRound: number
  inProgress: boolean
  allDone: boolean
  reasoningTraces: Record<string, string>
}) {
  const roundMembers = members.filter(m => m.round === currentRound || (currentRound === 1 && !m.round))
  const roundCritiques = critiques.filter(c => c.round === currentRound)

  if (currentRound === 1 || currentRound === 3) {
    return (
      <div className="space-y-4">
        {roundMembers.map((m, i) => (
          <div key={m.member_id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                <AgentSprite role={m.role} state={spriteStateFor(m.status)} />
                <span className="text-[9px] font-medium text-gray-500 leading-tight text-center">
                  {m.role} {m.round && <span className="text-council-500 ml-1">R{m.round}</span>}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <MemberBubble
                  member={m}
                  reasoningTrace={reasoningTraces[m.member_id]}
                  newArrival={inProgress && i === roundMembers.length - 1}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (currentRound === 2 || currentRound === 4) {
    return (
      <div className="space-y-4">
        {roundCritiques.map((c, i) => {
          const reviewer = members.find(m => m.member_id === c.reviewer_id)
          return (
            <div key={c.reviewer_id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                  <AgentSprite role={reviewer?.role || 'Reviewer'} state={inProgress && i === roundCritiques.length - 1 ? 'thinking' : 'done'} />
                  <span className="text-[9px] font-medium text-gray-500 leading-tight text-center">
                    {reviewer?.role} (critique)
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <CritiqueBubble critique={c} allMembers={members} />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (currentRound === 5) {
    return (
      <div className="border-t border-gray-100 pt-4 mt-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
            <AgentSprite role="Chair" state={inProgress ? 'thinking' : 'done'} />
            <span className="text-[9px] font-semibold text-council-700 leading-tight text-center">Chair</span>
          </div>
          <div className="flex-1 min-w-0">
            {chair ? (
              <ChairBubble chair={chair} />
            ) : (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-400 italic">
                {inProgress ? 'Chair synthesizing final verdict...' : 'Waiting for chair synthesis...'}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return null
}

/** Per-member bubble, presentation driven entirely by member.status. Undefined status (historical replay) is treated as 'done'. */
function MemberBubble({ member, reasoningTrace, newArrival }: {
  member: MemberResult
  reasoningTrace?: string
  newArrival?: boolean
}) {
  const status = member.status ?? 'done'

  if (status === 'queued') return <QueuedRow />
  if (status === 'error') return <ErrorRow error={member.error} />
  if (status === 'thinking') return <ThinkingRail text={member.analysis} round={member.round} />
  return <DoneBubble member={member} reasoningTrace={reasoningTrace} newArrival={newArrival} />
}

function QueuedRow() {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2.5 text-[11px] text-gray-400 italic">
      Waiting to review...
    </div>
  )
}

function ErrorRow({ error }: { error?: string }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[11px] text-red-700">
      <span className="font-semibold">Error: </span>{error || 'This member failed to respond.'}
    </div>
  )
}

/** Collapsed thinking rail: shows the tail of live reasoning text so it reads as progress, not a frozen head. No confidence/risk badges — those don't exist until the member is done. */
function ThinkingRail({ text, round }: { text: string; round?: number }) {
  const tail = text.length > 180 ? text.slice(-180) : text

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/70 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1 text-[9px] font-medium text-gray-400 uppercase tracking-wider border-b border-gray-100">
        <span>⋯ thinking</span>
        {round && <span className="text-council-400 normal-case tracking-normal">Round {round}</span>}
      </div>
      <div className="pl-2.5 pr-3 py-2 border-l-2 border-gray-300 ml-2.5 my-1.5">
        <div className="font-mono text-[10px] text-gray-400 leading-relaxed whitespace-pre-wrap break-words">
          {tail.length < text.length && <span className="text-gray-300">...</span>}
          {tail}
          <span className="inline-block w-1.5 h-3 bg-gray-400 ml-0.5 align-text-bottom animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function DoneBubble({ member, reasoningTrace, newArrival }: {
  member: MemberResult
  reasoningTrace?: string
  newArrival?: boolean
}) {
  const clean = useMemo(() => cleanResponse(member.analysis), [member.analysis])
  const preview = useMemo(() => excerpt(clean), [clean])
  const role = member.role
  const risks = member.risks || []
  const confidence = member.confidence ?? 0

  const borderColor = role.includes('Scientific') ? 'border-blue-200' :
    role.includes('Skeptical') ? 'border-amber-200' :
    role.includes('Argument') ? 'border-emerald-200' :
    role.includes('Language') ? 'border-purple-200' :
    'border-gray-200'

  const bgColor = role.includes('Scientific') ? 'bg-blue-50/40' :
    role.includes('Skeptical') ? 'bg-amber-50/40' :
    role.includes('Argument') ? 'bg-emerald-50/40' :
    role.includes('Language') ? 'bg-purple-50/40' :
    'bg-white'

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} shadow-sm overflow-hidden
      ${newArrival ? 'ring-2 ring-council-300' : ''}`}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-inherit bg-white/60">
        {member.round && (
          <span className="text-[9px] font-bold bg-council-500 text-white rounded px-1.5 py-0.5 mr-auto">
            Round {member.round}
          </span>
        )}
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          confidence >= 0.7 ? 'bg-green-100 text-green-700' :
          confidence >= 0.4 ? 'bg-yellow-100 text-yellow-700' :
          'bg-red-100 text-red-700'
        }`}>
          {Math.round(confidence * 100)}% confident
        </span>
        {risks.length > 0 && (
          <span className="text-[10px] bg-red-50 text-red-600 rounded px-1.5 py-0.5">
            {risks.length} risk{risks.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="px-3 py-2 text-xs text-gray-700 space-y-1">
        {member.recommendation && (
          <div className="text-[10px] text-council-700 bg-council-50 border border-council-100 rounded px-2 py-1">
            <span className="font-semibold">Recommendation: </span>{member.recommendation}
          </div>
        )}
        <div className="leading-relaxed whitespace-pre-wrap line-clamp-3">{preview}</div>
        <details className="text-[10px]">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">Full analysis</summary>
          <div className="mt-1 pt-1 border-t border-gray-100 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {clean}
          </div>
        </details>
        {reasoningTrace && (
          <details className="text-[10px]">
            <summary className="cursor-pointer text-gray-400 hover:text-gray-600 font-medium">show thinking</summary>
            <div className="mt-1 pt-1 border-t border-gray-100 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed font-mono text-gray-400">
              {reasoningTrace}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

function CritiqueBubble({ critique, allMembers }: {
  critique: Critique
  allMembers: MemberResult[]
}) {
  const reviewer = allMembers.find(m => m.member_id === critique.reviewer_id)

  const hasContent = critique.rankings.length > 0
    || Object.keys(critique.strongest_points).length > 0
    || Object.keys(critique.weaknesses).length > 0
    || critique.disagreements.length > 0

  if (!hasContent) return null

  const labels = critique.rankings

  return (
    <div className="animate-slide-in rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-gray-500 bg-gray-50 border-b border-gray-100">
        <svg className="w-3 h-3" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 3h12M4 7h6M4 10h4" />
        </svg>
        <span>Peer critique by {reviewer?.role ?? critique.reviewer_id} {critique.round && <span className="text-council-500 ml-1">R{critique.round}</span>}</span>
      </div>
      <div className="px-2.5 py-1.5 text-[10px] text-gray-600 space-y-1">
        {labels.length > 0 && (
          <div className="text-[9px] text-gray-400 mb-1">
            Ranking: {labels.map((l, i) => {
              const mid = critique.label_map?.[l]
              const role = mid ? allMembers.find(m => m.member_id === mid)?.role : null
              return `${i + 1}. ${l}${role ? ` (${role})` : ''}`
            }).join(' → ')}
          </div>
        )}

        {labels.map(label => {
          const mid = critique.label_map?.[label]
          const role = mid ? allMembers.find(m => m.member_id === mid)?.role : null
          const points = critique.strongest_points?.[label]
          const weaks = critique.weaknesses?.[label]
          if ((!points || points.length === 0) && (!weaks || weaks.length === 0)) return null
          return (
            <div key={label} className="border-t border-gray-100 pt-1 mt-1">
              <div className="text-[9px] font-medium text-gray-500">Response {label}{role ? ` (${role})` : ''}</div>
              {points && points.length > 0 && (
                <div className="ml-1 mt-0.5">
                  <span className="text-[9px] text-green-700">Strengths: </span>
                  <span className="text-[9px] text-gray-600">{points.join('; ')}</span>
                </div>
              )}
              {weaks && weaks.length > 0 && (
                <div className="ml-1 mt-0.5">
                  <span className="text-[9px] text-amber-700">Weaknesses: </span>
                  <span className="text-[9px] text-gray-600">{weaks.join('; ')}</span>
                </div>
              )}
            </div>
          )
        })}

        {critique.disagreements.length > 0 && (
          <div className="border-t border-gray-100 pt-1 mt-1">
            <span className="text-[9px] text-red-600">Disagreements:</span>
            <div className="text-[9px] text-gray-500">
              {critique.disagreements.map((d, i) => <p key={i} className="mt-0.5">{d}</p>)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ChairBubble({ chair }: { chair: ChairResult }) {
  return (
    <div className="rounded-xl border-2 border-council-200 bg-gradient-to-br from-council-50/80 to-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-council-100 bg-white/60">
        {chair.verdict && (
          <span className="text-[10px] font-medium bg-council-100 text-council-700 rounded px-1.5 py-0.5">
            {chair.verdict}
          </span>
        )}
      </div>
      <div className="px-3 py-2 text-xs text-gray-700 space-y-1.5">
        {chair.consensus.length > 0 && (
          <div className="p-2 bg-green-50 border border-green-200 rounded text-[10px] text-green-800">
            <strong>Consensus:</strong>
            <ul className="list-disc list-inside mt-0.5">
              {chair.consensus.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
        {chair.disagreements.length > 0 && (
          <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
            <strong>Disagreements:</strong>
            <ul className="list-disc list-inside mt-0.5">
              {chair.disagreements.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </div>
        )}
        {chair.scientific_risks.length > 0 && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-800">
            <strong>Risks:</strong>
            <ul className="list-disc list-inside mt-0.5">
              {chair.scientific_risks.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}
        <details className="text-[10px]">
          <summary className="cursor-pointer text-council-600 hover:text-council-700 font-medium">Full rationale</summary>
          <div className="mt-1 pt-1 border-t border-council-100 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {chair.rationale}
          </div>
        </details>
      </div>
    </div>
  )
}
