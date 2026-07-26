import type { CouncilResponse, StageEvent } from './types'
import { phaseFromStage } from './types'
import CouncilDiscussion from './CouncilDiscussion'
import CouncilTable from './CouncilTable'
import DiffView from './DiffView'

interface Props {
  result: CouncilResponse
  inProgress?: boolean
  currentStage?: StageEvent | null
  councilMode?: 'council' | 'debate'
}

export default function CouncilResult({ result, inProgress, currentStage, councilMode }: Props) {
  const chair = result.chair
  const phase = phaseFromStage(currentStage)
  const critiqueErrors = result.critique_errors || []

  return (
    <div className="space-y-3">
      <CouncilTable
        members={result.members}
        critiques={result.critiques}
        chair={chair}
        chairStatus={result.chair_status}
        phase={phase}
        activeMemberId={inProgress ? result.active_member_id : null}
        inProgress={inProgress}
        round={currentStage?.round}
      />

      <CouncilDiscussion
        members={result.members}
        critiques={result.critiques}
        chair={chair}
        inProgress={inProgress}
        mode={councilMode}
        currentRound={currentStage?.round}
        currentPhase={phase}
      />

      {result.chair_error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          <span className="font-semibold">Chair synthesis issue: </span>{result.chair_error}
        </div>
      )}

      {critiqueErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 space-y-0.5">
          <div className="font-semibold">Peer critique issues:</div>
          {critiqueErrors.map((e, i) => (
            <div key={`${e.reviewer_id}-${i}`}>{e.reviewer_id}: {e.error}</div>
          ))}
        </div>
      )}

      {chair?.recommended_text && chair.recommended_text !== result.text && !inProgress && (
        <div className="border-t border-gray-200 pt-3">
          <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">
            Text Comparison
          </div>
          <DiffView
            original={result.text}
            revised={chair.recommended_text}
            rationale={chair.rationale}
          />
        </div>
      )}
    </div>
  )
}
