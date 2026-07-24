import { useState } from 'react'
import type { PresetConfig, ModelRef, Settings, ModelOption } from './types'

interface Props {
  settings: Settings
  presets: PresetConfig[]
  models: ModelOption[]
  onSave: (s: Settings) => void
  onClose: () => void
}

function modelFromValue(v: string): ModelRef {
  const [provider, ...rest] = v.split('/')
  return { provider, model: rest.join('/') }
}

function valueFromModel(m: ModelRef): string {
  return `${m.provider}/${m.model}`
}

export default function SettingsPanel({ settings, presets, models, onSave, onClose }: Props) {
  const [local, setLocal] = useState<Settings>(() => ({
    defaultModel: { ...settings.defaultModel },
    modelOverrides: Object.fromEntries(
      Object.entries(settings.modelOverrides).map(([k, v]) => [k, { ...v }])
    ),
    scratchpadVisible: settings.scratchpadVisible,
  }))

  const providers = models.reduce((acc: Record<string, ModelOption[]>, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const allMembers = presets.flatMap(p =>
    p.members.map(m => ({
      member_id: m.id,
      preset_id: p.id,
      role: `${p.label} \u2192 ${m.role}`,
      provider: local.modelOverrides[p.id]?.[m.id]?.provider || m.model.provider,
      model: local.modelOverrides[p.id]?.[m.id]?.model || m.model.model,
    }))
  )

  const updateMember = (presetId: string, memberId: string, value: string) => {
    const ref = modelFromValue(value)
    setLocal(prev => ({
      ...prev,
      modelOverrides: {
        ...prev.modelOverrides,
        [presetId]: {
          ...(prev.modelOverrides[presetId] || {}),
          [memberId]: ref,
        },
      },
    }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Default model (single mode)</label>
            <select
              value={valueFromModel(local.defaultModel)}
              onChange={e => setLocal(prev => ({ ...prev, defaultModel: modelFromValue(e.target.value) }))}
              className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700"
            >
              {Object.entries(providers).map(([provider, providerModels]) => (
                <optgroup key={provider} label={provider}>
                  {providerModels.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Per-member models</label>
              <span className="text-[10px] text-gray-400">Override preset defaults</span>
            </div>
            {allMembers.length === 0 ? (
              <div className="text-xs text-gray-400 py-4 text-center">No presets loaded</div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {allMembers.map((m, i) => (
                  <div key={`${m.member_id}-${i}`} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-xs text-gray-600 flex-1 truncate" title={m.role}>{m.role}</span>
                    <select
                      value={valueFromModel({ provider: m.provider, model: m.model })}
                      onChange={e => updateMember(m.preset_id, m.member_id, e.target.value)}
                      className="text-[11px] border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 max-w-36"
                    >
                      {Object.entries(providers).map(([provider, providerModels]) => (
                        <optgroup key={provider} label={provider}>
                          {providerModels.map(mo => (
                            <option key={mo.value} value={mo.value}>{mo.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="scratchpad-vis"
              checked={local.scratchpadVisible}
              onChange={e => setLocal(prev => ({ ...prev, scratchpadVisible: e.target.checked }))}
              className="rounded border-gray-300"
            />
            <label htmlFor="scratchpad-vis" className="text-xs text-gray-700">Show scratchpad by default</label>
          </div>

          {models.length > 0 && (
            <div className="text-[10px] text-gray-400">
              {models.length} models available across {Object.keys(providers).length} providers
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800">Cancel</button>
          <button
            onClick={() => { onSave(local); onClose() }}
            className="px-3 py-1.5 text-xs bg-council-500 text-white rounded-lg hover:bg-council-600"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
