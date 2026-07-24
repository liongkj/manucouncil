import { useState, useEffect, useCallback } from 'react'
import type { Message, ModelRef, PresetConfig, CouncilResponse, AvailableModels, ModelOption } from './types'
import { DEFAULT_SETTINGS, type Settings } from './types'
import Chat from './Chat'
import SettingsPanel from './Settings'

const SETTINGS_KEY = 'research-council-settings'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_SETTINGS, ...parsed }
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS
}

function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s))
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [presets, setPresets] = useState<PresetConfig[]>([])
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([])
  const [loading, setLoading] = useState(false)
  const [serverOk, setServerOk] = useState(false)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [showSettings, setShowSettings] = useState(false)
  const [councilProgress, setCouncilProgress] = useState<CouncilResponse | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => setServerOk(d.status === 'ok'))
      .catch(() => setServerOk(false))
    fetch('/api/presets')
      .then(r => r.json())
      .then(d => setPresets(d))
      .catch(() => {})
    fetch('/api/models')
      .then(r => r.json())
      .then((d: AvailableModels) => setAvailableModels(d.models || []))
      .catch(() => {})
  }, [])

  const handleSettingsSave = useCallback((s: Settings) => {
    setSettings(s)
    saveSettings(s)
  }, [])

  const appendMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg])
  }, [])

  const handleSingleModel = useCallback(async (text: string, model: ModelRef) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model, stream: false }),
    })
    const data = await res.json()
    setMessages(prev => [...prev, {
      role: 'assistant',
      text: data.text,
      model: data.model,
    }])
  }, [])

  const handleEvent = useCallback((ev: string, d: any, presetId: string, presetLabel?: string) => {
    if (ev === 'member_text') {
      setCouncilProgress(prev => {
        if (!prev) return prev
        const existing = prev.members.find(m => m.member_id === d.member_id)
        if (existing) {
          return {
            ...prev,
            members: prev.members.map(m =>
              m.member_id === d.member_id ? { ...m, analysis: d.text } : m
            ),
          }
        }
        return {
          ...prev,
          members: [...prev.members, {
            member_id: d.member_id,
            role: d.role || '',
            model: { provider: '', model: '' },
            analysis: d.text,
            recommendation: null,
            risks: [],
            confidence: 0.5,
          }],
        }
      })
    } else if (ev === 'member_done') {
      setCouncilProgress(prev => prev ? {
        ...prev,
        members: [...prev.members.filter(m => m.member_id !== d.member_id), {
          member_id: d.member_id,
          role: d.role,
          model: d.model,
          analysis: d.analysis,
          recommendation: null,
          risks: d.risks || [],
          confidence: d.confidence || 0.5,
        }],
      } : prev)
    } else if (ev === 'critique_done') {
      setCouncilProgress(prev => prev ? {
        ...prev,
        critiques: [...(prev.critiques || []), {
          reviewer_id: d.reviewer_id,
          rankings: [],
          strongest_points: [],
          weaknesses: {},
          disagreements: d.disagreements || [],
        }],
      } : prev)
    } else if (ev === 'chair_done') {
      setCouncilProgress(prev => prev ? {
        ...prev,
        chair: {
          verdict: d.verdict || '',
          consensus: d.consensus || [],
          disagreements: d.disagreements || [],
          scientific_risks: d.scientific_risks || [],
          recommended_text: d.recommended_text || null,
          rationale: d.rationale || '',
        },
      } : prev)
    } else if (ev === 'done') {
      setCouncilProgress(prev => {
        if (prev) {
          setMessages(m => [...m, {
            role: 'assistant',
            text: '',
            council: prev,
            preset_label: presetLabel ?? presetId,
          }])
        }
        return null
      })
    } else if (ev === 'error') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Council error: ${typeof d === 'string' ? d : JSON.stringify(d)}`,
      }])
      setCouncilProgress(null)
    }
  }, [])

  const handleCouncil = useCallback(async (text: string, presetId: string, scratchpad: string, councilMode: string) => {
    const preset = presets.find(p => p.id === presetId)
    const overrides = settings.modelOverrides[presetId]
    const contractOverrides = settings.customContracts[presetId]
    const body: Record<string, unknown> = { text, preset_id: presetId, scratchpad, mode: councilMode }
    if (overrides && Object.keys(overrides).length > 0) {
      body.model_overrides = overrides
    }
    if (contractOverrides && Object.keys(contractOverrides).length > 0) {
      body.contract_overrides = contractOverrides
    }

    setCouncilProgress({ preset_id: presetId, text, chair: null, members: [], critiques: [] })

    const res = await fetch('/api/council/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok || !res.body) throw new Error('Council stream failed')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    let currentEvent = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''

      for (let line of lines) {
        line = line.trim()
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim()
          let d: any
          try {
            d = JSON.parse(raw)
          } catch {
            d = raw
          }
          handleEvent(currentEvent, d, presetId, preset?.label)
          currentEvent = ''
        }
      }
    }
  }, [presets, settings, handleEvent])

  const onSend = useCallback(async (
    text: string,
    mode: 'single' | 'council',
    model: ModelRef,
    presetId: string,
    scratchpad: string,
    councilMode: string = 'council',
  ) => {
    setLoading(true)
    try {
      if (mode === 'single') {
        await handleSingleModel(text, model)
      } else {
        await handleCouncil(text, presetId, scratchpad, councilMode)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        text: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
      }])
      setCouncilProgress(null)
    } finally {
      setLoading(false)
    }
  }, [handleSingleModel, handleCouncil])

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white px-4 py-2 shrink-0">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-gradient-to-br from-council-400 to-council-600 flex items-center justify-center text-white text-xs font-bold shadow-sm">
              C
            </div>
            <span className="text-sm font-semibold text-gray-800">Research Writing Council</span>
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <div className={`w-1.5 h-1.5 rounded-full ${serverOk ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-[10px] text-gray-400 hidden sm:inline">{serverOk ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        <Chat
          messages={messages}
          presets={presets}
          models={availableModels}
          settings={settings}
          onSend={onSend}
          onAppendMessage={appendMessage}
          loading={loading}
          councilProgress={councilProgress}
          onOpenSettings={() => setShowSettings(true)}
          onSettingsChange={handleSettingsSave}
        />
      </main>

      {showSettings && (
        <SettingsPanel
          settings={settings}
          presets={presets}
          models={availableModels}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}
