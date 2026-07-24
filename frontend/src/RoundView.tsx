import { useMemo } from 'react'
import type { MemberResult, Critique, ChairResult } from './types'

interface Props {
  members: MemberResult[]
  critiques: Critique[] | null
  chair: ChairResult | null
  inProgress?: boolean
}

function summaryFrom(text: string, maxLen = 120): string {
  const cleaned = text.replace(/```[\s\S]*?```/g, '').trim()
  if (!cleaned) return text.slice(0, maxLen)
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen) + '...'
}

const ROLE_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  'Scientific Editor': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  'Scientific Verifier': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-800', badge: 'bg-blue-100 text-blue-700' },
  'Skeptical Referee': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', badge: 'bg-amber-100 text-amber-700' },
  'Argument Editor': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700' },
  'Language Editor': { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', badge: 'bg-purple-100 text-purple-700' },
}

function MemberCard({ member, streaming }: { member: MemberResult; streaming?: boolean }) {
  const c = ROLE_COLORS[member.role] || { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-800', badge: 'bg-gray-100 text-gray-700' }
  const summary = useMemo(() => summaryFrom(member.analysis), [member.analysis])

  return (
    <div className={`animate-fade-in-up border-2 rounded-xl overflow-hidden shadow-sm transition-all ${c.border} ${c.bg}`}>
      <div className={`flex items-center gap-2 px-3 py-2 text-xs ${c.text} border-b border-inherit`}>
        {streaming && (
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
        )}
        <span className="font-semibold flex-1">{member.role}</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-700 space-y-1">
        {summary && (
          <div className="leading-relaxed whitespace-pre-wrap line-clamp-4">
            {summary}
          </div>
        )}
        <details className="text-[10px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">Show full analysis</summary>
          <div className="mt-1 pt-1 border-t border-gray-100 max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed">
            {member.analysis}
          </div>
        </details>
      </div>
    </div>
  )
}

function CritiqueCard({ critique, allMembers }: { critique: Critique; allMembers: MemberResult[] }) {
  const reviewer = allMembers.find(m => m.member_id === critique.reviewer_id)

  const hasContent = critique.rankings.length > 0
    || Object.keys(critique.strongest_points).length > 0
    || Object.keys(critique.weaknesses).length > 0
    || critique.disagreements.length > 0

  if (!hasContent) return null

  return (
    <div className="animate-slide-in border border-gray-200 rounded-xl overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-50 text-gray-600 border-b border-gray-100">
        <svg className="w-3 h-3" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M1 3h12M4 7h6M4 10h4" />
        </svg>
        <span className="font-medium">Peer review by {reviewer?.role ?? critique.reviewer_id}</span>
      </div>
      <div className="px-3 py-2 text-xs text-gray-700 space-y-1">
        {critique.rankings.length > 0 && (
          <div className="text-[10px] text-gray-500">
            Ranking: {critique.rankings.map((l, i) => {
              const mid = critique.label_map?.[l]
              const role = mid ? allMembers.find(m => m.member_id === mid)?.role : null
              return `${i + 1}. ${l}${role ? ` (${role})` : ''}`
            }).join(' → ')}
          </div>
        )}
        {critique.rankings.map(label => {
          const mid = critique.label_map?.[label]
          const role = mid ? allMembers.find(m => m.member_id === mid)?.role : null
          const points = critique.strongest_points?.[label]
          const weaks = critique.weaknesses?.[label]
          if ((!points || points.length === 0) && (!weaks || weaks.length === 0)) return null
          return (
            <div key={label} className="border-t border-gray-100 pt-1 mt-1">
              <div className="text-[10px] font-medium text-gray-500">Response {label}{role ? ` (${role})` : ''}</div>
              {points && points.length > 0 && (
                <div className="ml-1 mt-0.5 text-[11px]">
                  <span className="text-green-700">Strengths: </span>
                  <span className="text-gray-600">{points.join('; ')}</span>
                </div>
              )}
              {weaks && weaks.length > 0 && (
                <div className="ml-1 mt-0.5 text-[11px]">
                  <span className="text-amber-700">Weaknesses: </span>
                  <span className="text-gray-600">{weaks.join('; ')}</span>
                </div>
              )}
            </div>
          )
        })}
        {critique.disagreements.length > 0 && (
          <div className="border-t border-gray-100 pt-1 mt-1">
            <span className="text-[10px] text-red-600">Disagreements:</span>
            {critique.disagreements.map((d, i) => (
              <p key={i} className="text-[11px] text-gray-500 mt-0.5">{d}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function LoadingCard({ role }: { role: string }) {
  return (
    <div className="animate-fade-in-up border-2 border-dashed border-gray-200 rounded-xl overflow-hidden opacity-70">
      <div className="flex items-center gap-2 px-3 py-2 text-xs bg-gray-50 text-gray-400">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-pulse" />
        <span className="font-medium flex-1">{role}</span>
        <div className="flex gap-0.5">
          <span className="w-1 h-3 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-3 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-3 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
      <div className="px-3 py-3 bg-white">
        <div className="h-2 bg-gray-100 rounded animate-pulse w-3/4 mb-2" />
        <div className="h-2 bg-gray-100 rounded animate-pulse w-1/2" />
      </div>
    </div>
  )
}

export default function RoundView({ members, critiques, chair, inProgress }: Props) {
  const critiqueList = critiques || []
  const hasMembers = members.length > 0
  const hasCritiques = critiqueList.length > 0
  const hasChair = !!chair

  return (
    <div className="space-y-3">
      <div className="flex gap-1 text-[10px] font-medium text-gray-400">
        {[
          { id: 1, label: 'Reviews', count: members.length },
          { id: 2, label: 'Critiques', count: critiqueList.length },
          { id: 3, label: 'Chair', done: hasChair },
        ].map(s => (
          <span key={s.id} className={`px-2 py-1 rounded ${
            ('count' in s && s.count! > 0) || ('done' in s && s.done)
              ? 'bg-council-50 text-council-700'
              : inProgress ? 'text-gray-300' : 'text-gray-400'
          }`}>
            Round {s.id}: {s.label}
            {'count' in s && s.count! > 0 ? ` (${s.count})` : ''}
            {'done' in s && s.done ? ' \u2713' : ''}
          </span>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <span>Round 1 — Independent Reviews</span>
          {hasMembers && <span className="text-[10px] text-green-600">({members.length} received)</span>}
        </div>
        <div className="space-y-2">
          {members.map((m, i) => (
            <div key={m.member_id} style={{ animationDelay: `${Math.min(i * 80, 400)}ms` }}>
              <MemberCard member={m} streaming={inProgress && i === members.length - 1} />
            </div>
          ))}
          {inProgress && !hasMembers && (
            <>
              <LoadingCard role="Scientific Editor" />
              <LoadingCard role="Skeptical Referee" />
            </>
          )}
          {!inProgress && !hasMembers && (
            <div className="text-xs text-gray-400 py-2 italic text-center">No members in this preset</div>
          )}
        </div>
      </div>

      {(hasCritiques || (inProgress && hasMembers)) && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <span>Round 2 — Anonymous Peer Critiques</span>
            {hasCritiques && <span className="text-[10px] text-green-600">({critiqueList.length} received)</span>}
          </div>
          {hasCritiques ? (
            <div className="space-y-2">
              {critiqueList.map((c, i) => (
                <div key={c.reviewer_id} style={{ animationDelay: `${Math.min(i * 80, 400)}ms` }}>
                  <CritiqueCard critique={c} allMembers={members} />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400 py-2 italic text-center">Waiting for critiques...</div>
          )}
        </div>
      )}

      {hasChair && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Final — Chair Synthesis</div>
          <div className="animate-fade-in-up bg-gradient-to-r from-council-50 to-white border-2 border-council-200 rounded-xl p-3 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-council-500 flex items-center justify-center text-white text-[9px] font-bold">C</div>
              <span className="text-xs font-semibold text-council-800">Chair</span>
              {chair!.verdict && (
                <span className="text-[10px] bg-council-100 text-council-700 rounded px-1.5 py-0.5">{chair!.verdict}</span>
              )}
            </div>
            {chair!.consensus.length > 0 && (
              <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-[10px] text-green-800">
                <strong>Consensus:</strong>
                <ul className="list-disc list-inside mt-0.5">
                  {chair!.consensus.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {chair!.disagreements.length > 0 && (
              <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-[10px] text-yellow-800">
                <strong>Disagreements:</strong>
                <ul className="list-disc list-inside mt-0.5">
                  {chair!.disagreements.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
            {chair!.scientific_risks.length > 0 && (
              <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-[10px] text-red-800">
                <strong>Scientific Risks:</strong>
                <ul className="list-disc list-inside mt-0.5">
                  {chair!.scientific_risks.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}
            <details className="text-[10px] text-gray-600 mt-1">
              <summary className="cursor-pointer text-council-600 hover:text-council-700 font-medium">Full rationale</summary>
              <div className="mt-1 p-2 bg-white rounded text-xs leading-relaxed whitespace-pre-wrap">{chair!.rationale}</div>
            </details>
          </div>
        </div>
      )}

      {!hasChair && inProgress && hasMembers && (
        <div className="space-y-2">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Final — Chair Synthesis</div>
          <div className="text-xs text-gray-400 py-3 italic text-center">Waiting for chair synthesis...</div>
        </div>
      )}
    </div>
  )
}
