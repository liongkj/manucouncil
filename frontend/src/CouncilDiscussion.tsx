import { useMemo } from 'react'
import type { MemberResult, Critique, ChairResult } from './types'
import AgentSprite from './AgentSprite'
import { cleanResponse, excerpt } from './utils'

interface Props {
  members: MemberResult[]
  critiques: Critique[] | null
  chair: ChairResult | null
  inProgress?: boolean
}

const ROLE_ORDER = ['Scientific Editor', 'Skeptical Referee', 'Argument Editor', 'Language Editor', 'Scientific Verifier']

function memberIndex(m: MemberResult): number {
  const idx = ROLE_ORDER.indexOf(m.role)
  return idx >= 0 ? idx : 99
}

export default function CouncilDiscussion({ members, critiques, chair, inProgress }: Props) {
  const sorted = useMemo(() => [...members].sort((a, b) => memberIndex(a) - memberIndex(b)), [members])
  const critiqueList = critiques || []
  const hasChair = !!chair
  const allDone = !inProgress

  const maxMembers = useMemo(() => {
    const count = members.length
    if (hasChair) return count + 1
    if (inProgress) return Math.max(count + 1, 2)
    return count
  }, [members.length, hasChair, inProgress])

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
                    role={m.role}
                    newArrival={inProgress && i === sorted.length - 1}
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

        {inProgress && members.length < maxMembers && (
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

function ChatBubble({ text, role, newArrival }: {
  text: string
  role: string
  newArrival?: boolean
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
      <div className="px-3 py-2 text-xs text-gray-700 space-y-1">
          <div className="leading-relaxed whitespace-pre-wrap line-clamp-3">{preview}</div>
        <details className="text-[10px]">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 font-medium">Full analysis</summary>
          <div className="mt-1 pt-1 border-t border-gray-100 max-h-64 overflow-y-auto whitespace-pre-wrap leading-relaxed">
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
        <span>Peer critique by {reviewer?.role ?? critique.reviewer_id}</span>
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
