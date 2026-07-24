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
}

export interface Critique {
  reviewer_id: string
  rankings: string[]
  strongest_points: string[]
  weaknesses: Record<string, string[]>
  disagreements: string[]
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
}

export const DEFAULT_SETTINGS: Settings = {
  defaultModel: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  modelOverrides: {},
  scratchpadVisible: false,
  commissionedModels: [],
  customContracts: {},
}
