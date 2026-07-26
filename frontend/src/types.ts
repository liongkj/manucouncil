export interface ModelRef {
  provider: string
  model: string
}

export interface ModelOption {
  value: string
  label: string
  provider: string
}

export interface AvailableModels {
  models: ModelOption[]
  providers: string[]
}

export interface PresetMember {
  id: string
  role: string
  model: ModelRef
  contract: string
  skip_in_critique?: boolean
}

export interface PresetChair {
  model: ModelRef
  contract: string
}

export interface PresetConfig {
  id: string
  label: string
  group: 'quick' | 'council'
  description: string
  members: PresetMember[]
  chair: PresetChair | null
  skip_critique: boolean
  skip_chair: boolean
}

/** Lifecycle of one council member during a run. */
export type MemberStatus = 'queued' | 'thinking' | 'done' | 'error'

/** Visual state of a sprite at the table. `listening` is derived, not streamed. */
export type SpriteState = 'idle' | 'queued' | 'thinking' | 'speaking' | 'listening' | 'done' | 'error'

export interface MemberResult {
  member_id: string
  role: string
  model: ModelRef
  analysis: string
  recommendation: string | null
  risks: string[]
  confidence: number
  round?: number
  status?: MemberStatus
  error?: string
}

export interface RosterMember {
  member_id: string
  role: string
  model: ModelRef
  skip_in_critique?: boolean
}

/** Sent once, before any text streams, so the table can be seated up front. */
export interface Roster {
  mode: 'council' | 'debate'
  preset_id: string
  preset_label: string
  has_chair: boolean
  has_critique: boolean
  sequential: boolean
  members: RosterMember[]
}

export type ChairStatus = 'idle' | 'thinking' | 'done' | 'error'

export interface CritiqueError {
  reviewer_id: string
  error: string
}

export interface Critique {
  reviewer_id: string
  rankings: string[]
  strongest_points: Record<string, string[]>
  weaknesses: Record<string, string[]>
  disagreements: string[]
  round?: number
  label_map?: Record<string, string>
}

export interface ChairResult {
  verdict: string
  consensus: string[]
  disagreements: string[]
  scientific_risks: string[]
  recommended_text: string | null
  rationale: string
}

export interface CouncilResponse {
  preset_id: string
  text: string
  chair: ChairResult | null
  members: MemberResult[]
  critiques: Critique[] | null
  roster?: Roster | null
  chair_status?: ChairStatus
  chair_error?: string | null
  critique_errors?: CritiqueError[]
  /** Member that most recently emitted text — drives the speaking sprite at the table. */
  active_member_id?: string | null
}

export interface StageEvent {
  stage: 'members' | 'critiques' | 'chair' | 'debate'
  status: 'starting' | 'complete' | 'round_1_reviews' | 'round_2_critique' | 'round_3_revision' | 'round_4_final_critique' | 'chair_starting'
  round?: number
  total?: number
}

/** Named pipeline phases, shared by the stepper and the table. */
export type PhaseKey = 'reviews' | 'critique' | 'revision' | 'final_critique' | 'chair' | 'complete'

export const COUNCIL_PHASES: PhaseKey[] = ['reviews', 'critique', 'chair']
export const DEBATE_PHASES: PhaseKey[] = ['reviews', 'critique', 'revision', 'final_critique', 'chair']

export const PHASE_LABELS: Record<PhaseKey, string> = {
  reviews: 'Independent reviews',
  critique: 'Peer critique',
  revision: 'Revision',
  final_critique: 'Final critique',
  chair: 'Chair synthesis',
  complete: 'Complete',
}

/** Single source of truth for turning a raw stage event into a phase. */
export function phaseFromStage(stage: StageEvent | null | undefined): PhaseKey | null {
  if (!stage) return null
  if (stage.stage === 'members') return 'reviews'
  if (stage.stage === 'critiques') return 'critique'
  if (stage.stage === 'chair') return 'chair'
  switch (stage.status) {
    case 'round_1_reviews': return 'reviews'
    case 'round_2_critique': return 'critique'
    case 'round_3_revision': return 'revision'
    case 'round_4_final_critique': return 'final_critique'
    case 'chair_starting': return 'chair'
    case 'complete': return 'complete'
    default: return null
  }
}

export interface Message {
  role: 'user' | 'assistant'
  text: string
  model?: ModelRef
  council?: CouncilResponse
  preset_label?: string
}

export interface Settings {
  defaultModel: ModelRef
  modelOverrides: Record<string, Record<string, ModelRef>>
  scratchpadVisible: boolean
  commissionedModels: string[]
  customContracts: Record<string, Record<string, string>>
  scratchpadNotes: ScratchpadNote[]
}

export interface ScratchpadNote {
  id: string
  content: string
  includeInPrompt: boolean
  createdAt: string
  sessionId?: string
}

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  modelOverrides: {},
  scratchpadVisible: false,
  commissionedModels: [],
  customContracts: {},
  scratchpadNotes: [],
}
