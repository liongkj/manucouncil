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
    modelOverrides: JSON.parse(JSON.stringify(settings.modelOverrides)),
    scratchpadVisible: settings.scratchpadVisible,
    commissionedModels: [...settings.commissionedModels],
    customContracts: JSON.parse(JSON.stringify(settings.customContracts)),
    scratchpadNotes: settings.scratchpadNotes ? [...settings.scratchpadNotes] : [],
  }))

  const providers = models.reduce((acc: Record<string, ModelOption[]>, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const allModels = models.map(m => m.value)

  const commissionedList = local.commissionedModels || []
  const commissionSet = new Set(commissionedList.length > 0 ? commissionedList : allModels)

  const commissionedOptions = models.filter(m => commissionSet.has(m.value))
  const commissionedProviders = commissionedOptions.reduce((acc: Record<string, ModelOption[]>, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {})

  const toggleCommission = (value: string) => {
    setLocal(prev => {
      const prevCom = prev.commissionedModels || []
      const set = new Set(prevCom.length > 0 ? prevCom : allModels)
      if (set.has(value)) set.delete(value)
      else set.add(value)
      return { ...prev, commissionedModels: Array.from(set) }
    })
  }

  const isDefaultCommissioned = (local.commissionedModels || []).length === 0

  const allMembers = presets.flatMap(p =>
    p.members.map(m => ({
      member_id: m.id,
      preset_id: p.id,
      role: `${p.label} \u2192 ${m.role}`,
      provider: local.modelOverrides[p.id]?.[m.id]?.provider || m.model.provider,
      model: local.modelOverrides[p.id]?.[m.id]?.model || m.model.model,
      contract: local.customContracts[p.id]?.[m.id] || m.contract,
    }))
  )

  const updateMember = (presetId: string, memberId: string, field: string, value: any) => {
    setLocal(prev => {
      if (field === 'model') {
        const ref = modelFromValue(value)
        return {
          ...prev,
          modelOverrides: {
            ...prev.modelOverrides,
            [presetId]: {
              ...(prev.modelOverrides[presetId] || {}),
              [memberId]: ref,
            },
          },
        }
      }
      if (field === 'contract') {
        return {
          ...prev,
          customContracts: {
            ...prev.customContracts,
            [presetId]: {
              ...(prev.customContracts[presetId] || {}),
              [memberId]: value,
            },
          },
        }
      }
      return prev
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-xl shadow-xl max-w-xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Default model */}
          <div>
            <label className="text-xs font-medium text-gray-700 block mb-2">Default model (single mode)</label>
            <select
              value={valueFromModel(local.defaultModel)}
              onChange={e => setLocal(prev => ({ ...prev, defaultModel: modelFromValue(e.target.value) }))}
              className="w-full text-xs border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700"
            >
              {Object.entries(commissionedProviders).map(([provider, providerModels]) => (
                <optgroup key={provider} label={provider}>
                  {providerModels.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Commissioned Models */}
          <div>
            <details open>
              <summary className="text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                Commissioned Models
                <span className="text-gray-400 font-normal ml-1">({isDefaultCommissioned ? 'all' : local.commissionedModels.length} selected)</span>
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1 max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-2">
                {models.map(m => (
                  <label key={m.value} className="flex items-center gap-1.5 text-[11px] text-gray-600 hover:text-gray-800 cursor-pointer px-1 py-0.5 rounded hover:bg-white">
                    <input
                      type="checkbox"
                      checked={commissionSet.has(m.value)}
                      onChange={() => toggleCommission(m.value)}
                      className="rounded border-gray-300 w-3 h-3"
                    />
                    <span className="truncate">{m.label}</span>
                    <span className="text-[9px] text-gray-400 ml-auto">{m.provider}</span>
                  </label>
                ))}
              </div>
              {isDefaultCommissioned && (
                <p className="text-[10px] text-gray-400 mt-1">All models shown. Uncheck to commission specific models.</p>
              )}
            </details>
          </div>

          {/* Member Editor */}
          <div>
            <details open>
              <summary className="text-xs font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                Member Configuration
                <span className="text-gray-400 font-normal ml-1">({allMembers.length} members)</span>
              </summary>
              <div className="mt-2 space-y-3">
                {allMembers.map((m, i) => (
                  <div key={`${m.member_id}-${i}`} className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                    <div className="text-[11px] font-medium text-gray-600">{m.role}</div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-400 shrink-0">Model:</span>
                      <select
                        value={valueFromModel({ provider: m.provider, model: m.model })}
                        onChange={e => updateMember(m.preset_id, m.member_id, 'model', e.target.value)}
                        className="flex-1 text-[11px] border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                      >
                        {Object.entries(commissionedProviders).map(([provider, providerModels]) => (
                          <optgroup key={provider} label={provider}>
                            {providerModels.map(mo => (
                              <option key={mo.value} value={mo.value}>{mo.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400 block mb-1">Prompt / Contract:</span>
                      <textarea
                        value={m.contract}
                        onChange={e => updateMember(m.preset_id, m.member_id, 'contract', e.target.value)}
                        rows={3}
                        className="w-full text-[10px] border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-700 resize-y focus:outline-none focus:ring-1 focus:ring-council-300"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* Scratchpad */}
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
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 shrink-0">
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
