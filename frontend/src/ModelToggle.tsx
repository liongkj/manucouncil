import type { ModelRef, PresetConfig, Settings, ModelOption } from './types'

interface Props {
  mode: 'single' | 'council'
  onModeChange: (m: 'single' | 'council') => void
  model: ModelRef
  onModelChange: (m: ModelRef) => void
  presets: PresetConfig[]
  selectedPreset: string
  onPresetChange: (id: string) => void
  settings: Settings
  models: ModelOption[]
}

function modelFromValue(v: string): ModelRef {
  const [provider, ...rest] = v.split('/')
  return { provider, model: rest.join('/') }
}

function valueFromModel(m: ModelRef): string {
  return `${m.provider}/${m.model}`
}

export default function ModelToggle({
  mode, onModeChange,
  model, onModelChange,
  presets, selectedPreset, onPresetChange,
  settings, models,
}: Props) {
  const quickPresets = presets.filter(p => p.group === 'quick')
  const councilPresets = presets.filter(p => p.group === 'council')
  const selPreset = presets.find(p => p.id === selectedPreset)
  const currentModelValue = valueFromModel(model)

  const overrideCount = selPreset
    ? selPreset.members.filter(m => settings.modelOverrides[selPreset.id]?.[m.id]).length
    : 0

  const providers = models.reduce((acc: Record<string, ModelOption[]>, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex rounded-lg border border-gray-300 overflow-hidden">
        <button
          onClick={() => onModeChange('single')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors
            ${mode === 'single'
              ? 'bg-council-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          Single
        </button>
        <button
          onClick={() => onModeChange('council')}
          className={`px-3 py-1.5 text-xs font-medium transition-colors
            ${mode === 'council'
              ? 'bg-council-500 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'}`}
        >
          Council
        </button>
      </div>

      {mode === 'single' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">model</span>
          <select
            value={currentModelValue}
            onChange={e => onModelChange(modelFromValue(e.target.value))}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 max-w-44"
          >
            {models.length === 0 && <option value={currentModelValue}>{currentModelValue}</option>}
            {Object.entries(providers).map(([provider, providerModels]) => (
              <optgroup key={provider} label={provider}>
                {providerModels.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {mode === 'council' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">preset</span>
          <select
            value={selectedPreset}
            onChange={e => onPresetChange(e.target.value)}
            className="text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700"
          >
            {quickPresets.length > 0 && (
              <optgroup label="Quick">
                {quickPresets.map(p => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </optgroup>
            )}
            {councilPresets.length > 0 && (
              <optgroup label="Council">
                {councilPresets.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.label}{overrideCount > 0 ? ` (${overrideCount} custom)` : ''}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {selPreset && (
            <span className="text-[10px] text-gray-400 max-w-40 truncate hidden sm:block" title={selPreset.description}>
              {selPreset.description}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
