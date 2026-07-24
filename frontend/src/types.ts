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

export interface MemberResult {
  member_id: string
  role: string
  model: ModelRef
  analysis: string
  recommendation: string | null
  risks: string[]
  confidence: number
  round?: number
}

export interface Critique {
  reviewer_id: string
  rankings: string[]
  strongest_points: string[]
  weaknesses: Record<string, string[]>
  disagreements: string[]
  round?: number
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
}

export interface StageEvent {
  stage: 'members' | 'critiques' | 'chair' | 'debate'
  status: 'starting' | 'complete' | 'round_1_reviews' | 'round_2_critique' | 'round_3_revision' | 'round_4_final_critique' | 'chair_starting'
  round?: number
  total?: number
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
