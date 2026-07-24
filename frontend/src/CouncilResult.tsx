import type { CouncilResponse } from './types'
import CouncilDiscussion from './CouncilDiscussion'
import DiffView from './DiffView'

interface Props {
  result: CouncilResponse
  inProgress?: boolean
}

export default function CouncilResult({ result, inProgress }: Props) {
  const chair = result.chair

  return (
    <div className="space-y-3">
      <CouncilDiscussion
        members={result.members}
        critiques={result.critiques}
        chair={chair}
        inProgress={inProgress}
      />

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
