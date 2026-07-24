import { useMemo, useState } from 'react'
import type { MemberResult, Critique, ChairResult } from './types'
import AgentSprite from './AgentSprite'
import { cleanResponse, excerpt } from './utils'

interface Props {
  members: MemberResult[]
  critiques: Critique[] | null
  chair: ChairResult | null
  inProgress?: boolean
  mode?: 'council' | 'debate'
  currentRound?: number
}

const ROLE_ORDER = ['Scientific Editor', 'Skeptical Referee', 'Argument Editor', 'Language Editor', 'Scientific Verifier']

function memberIndex(m: MemberResult): number {
  const idx = ROLE_ORDER.indexOf(m.role)
  return idx >= 0 ? idx : 99
}

export default function CouncilDiscussion({ members, critiques, chair, inProgress, mode = 'council', currentRound }: Props) {
  const sorted = useMemo(() => [...members].sort((a, b) => memberIndex(a) - memberIndex(b)), [members])
  const critiqueList = critiques || []
  const hasChair = !!chair
  const allDone = !inProgress

  const isDebate = mode === 'debate'
  const roundLabels: Record<number, string> = {
    1: 'Round 1: Independent Reviews',
    2: 'Round 2: Peer Critique',
    3: 'Round 3: Revision',
    4: 'Round 4: Final Critique',
    5: 'Chair Synthesis',
  }

  if (isDebate && currentRound) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
          <span>Council Discussion</span>
          <span className="px-2 py-0.5 bg-council-100 text-council-700 rounded">
            {roundLabels[currentRound] || `Round ${currentRound}`}
          </span>
        </div>

        <DebateRoundView
          members={sorted}
          critiques={critiqueList}
          chair={chair}
          currentRound={currentRound}
          inProgress={inProgress === true}
          allDone={allDone}
          totalMembers={members.length}
        />

        {hasChair && chair && currentRound >= 5 && (
          <div className="animate-fade-in-up border-t border-gray-100 pt-4 mt-4" style={{ animationDelay: '200ms' }}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                <AgentSprite role="Chair" animated={!allDone} />
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
      <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
        Council Discussion
      </div>

      <div className="space-y-4">
        {sorted.map((m, i) => {
          const c = critiqueList.find(cr => cr.reviewer_id === m.member_id)
          return (
            <div key={m.member_id} className="animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
              <div className="flex items-start gap-3">
                <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
                  <AgentSprite role={m.role} animated={inProgress && i === sorted.length - 1} />
                  <span className="text-[9px] font-medium text-gray-500 leading-tight text-center">{m.role}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <ChatBubble
                    text={m.analysis}
                    risks={m.risks}
                    confidence={m.confidence}
                    role={m.role}
                    newArrival={inProgress && i === sorted.length - 1}
                    round={m.round}
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

        {inProgress && members.length < Math.max(sorted.length + 1, 2) && (
          <ThinkingMember role="Reviewer" />
        )}
      </div>

      {hasChair && chair && (
        <div className="animate-fade-in-up border-t border-gray-100 pt-4 mt-4" style={{ animationDelay: '200ms' }}>
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
              <AgentSprite role="Chair" animated={!allDone} />
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
              <AgentSprite role="Chair" animated />
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

function DebateRoundView({ members, critiques, chair, currentRound, inProgress = false, allDone, totalMembers }: {
  members: MemberResult[]
  critiques: Critique[]
  chair: ChairResult | null
  currentRound: number
  inProgress: boolean
  allDone: boolean
  totalMembers: number
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
                <AgentSprite role={m.role} animated={inProgress && i === roundMembers.length - 1} />
                <span className="text-[9px] font-medium text-gray-500 leading-tight text-center">
                  {m.role} {m.round && <span className="text-council-500 ml-1">R{m.round}</span>}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <ChatBubble
                  text={m.analysis}
                  risks={m.risks}
                  confidence={m.confidence}
                  role={m.role}
                  newArrival={inProgress && i === roundMembers.length - 1}
                  round={m.round}
                />
              </div>
            </div>
          </div>
        ))}
        {inProgress && roundMembers.length < totalMembers && <ThinkingMember role="Reviewer" />}
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
                  <AgentSprite role={reviewer?.role || 'Reviewer'} animated={inProgress && i === roundCritiques.length - 1} />
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
        {inProgress && roundCritiques.length < totalMembers && <ThinkingMember role="Reviewer" />}
      </div>
    )
  }

  if (currentRound === 5) {
    return (
      <div className="border-t border-gray-100 pt-4 mt-4">
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
            <AgentSprite role="Chair" animated={inProgress} />
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

function ChatBubble({ text, risks, confidence, role, newArrival, round }: {
  text: string
  risks: string[]
  confidence: number
  role: string
  newArrival?: boolean
  round?: number
}) {
  const clean = useMemo(() => cleanResponse(text), [text])
  const preview = useMemo(() => excerpt(clean), [clean])

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
        {newArrival && (
          <span className="flex gap-0.5">
            <span className="w-1 h-2 bg-council-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-2 bg-council-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-2 bg-council-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        {round && (
          <span className="text-[9px] font-bold bg-council-500 text-white rounded px-1.5 py-0.5 mr-auto">
            Round {round}
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
        <div className="leading-relaxed whitespace-pre-wrap line-clamp-3">{preview}</div>
        <details className="text-[10px]">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">Full analysis</summary>
          <div className="mt-1 pt-1 border-t border-gray-100 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {risks.length > 0 && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-700">
                <strong>Risks:</strong>
                <ul className="list-disc list-inside mt-0.5">
                  {risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            {clean}
          </div>
        </details>
      </div>
    </div>
  )
}

function CritiqueBubble({ critique, allMembers }: {
  critique: Critique
  allMembers: MemberResult[]
}) {
  const reviewer = allMembers.find(m => m.member_id === critique.reviewer_id)
  const cleanDisagreements = useMemo(() =>
    critique.disagreements.map(d => cleanResponse(d)),
  [critique])
  const preview = useMemo(() => {
    return cleanDisagreements.join(' ').slice(0, 150) + '...'
  }, [cleanDisagreements])

  if (!critique.disagreements.length) return null

  return (
    <div className="animate-slide-in rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-gray-500 bg-gray-50 border-b border-gray-100">
        <svg className="w-3 h-3" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 3h12M4 7h6M4 10h4" />
        </svg>
        <span>Peer critique by {reviewer?.role ?? critique.reviewer_id} {critique.round && <span className="text-council-500 ml-1">R{critique.round}</span>}</span>
      </div>
      <div className="px-2.5 py-1.5 text-[10px] text-gray-600 space-y-0.5">
        <div className="leading-relaxed line-clamp-2">{preview}</div>
        <details className="text-[9px] mt-0.5">
          <summary className="cursor-pointer text-gray-400 hover:text-gray-600">Show all</summary>
          <div className="mt-1 pt-1 border-t border-gray-100 max-h-40 overflow-y-auto leading-relaxed">
            {cleanDisagreements.map((d, i) => <p key={i} className="mb-1">{d}</p>)}
          </div>
        </details>
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

function ThinkingMember({ role }: { role: string }) {
  return (
    <div className="animate-fade-in-up opacity-60">
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1 w-12 shrink-0">
          <AgentSprite role={role} animated />
          <span className="text-[9px] font-medium text-gray-400 leading-tight text-center">{role}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex gap-1">
              <span className="w-1.5 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.6s' }} />
              <span className="w-1.5 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.6s' }} />
              <span className="w-1.5 h-3 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.6s' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}