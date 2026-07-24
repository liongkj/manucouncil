import { useState, useRef, useEffect } from 'react'
import type { Message, ModelRef, PresetConfig, CouncilResponse, Settings, ModelOption } from './types'
import ModelToggle from './ModelToggle'
import CouncilResult from './CouncilResult'
import Scratchpad from './Scratchpad'

interface Props {
  messages: Message[]
  presets: PresetConfig[]
  models: ModelOption[]
  settings: Settings
  onSend: (text: string, mode: 'single' | 'council', model: ModelRef, presetId: string, scratchpad: string, councilMode?: string) => Promise<void>
  onAppendMessage: (msg: Message) => void
  loading: boolean
  councilProgress: CouncilResponse | null
  onOpenSettings: () => void
  onSettingsChange: (s: Settings) => void
}

export default function Chat({ messages, presets, models, settings, onSend, onAppendMessage, loading, councilProgress, onOpenSettings, onSettingsChange }: Props) {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'single' | 'council'>('single')
  const [model, setModel] = useState<ModelRef>(settings.defaultModel)
  const [selectedPreset, setSelectedPreset] = useState('scientific-claim')
  const [councilMode, setCouncilMode] = useState<'council' | 'debate'>('council')
  const [scratchpad, setScratchpad] = useState('')
  const [scratchpadVisible, setScratchpadVisible] = useState(settings.scratchpadVisible)
  const [streamingText, setStreamingText] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setModel(settings.defaultModel)
  }, [settings.defaultModel])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText, councilProgress])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')

    if (mode === 'single') {
      onAppendMessage({ role: 'user', text })
      setStreaming(true)
      setStreamingText('')

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, model, stream: true }),
        })
        if (!res.ok || !res.body) throw new Error('Stream failed')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let result = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const data = line.slice(6).trim()
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.event === 'chunk') {
                result += (parsed.data || '')
                setStreamingText(result)
              }
              if (parsed.event === 'done' || parsed.event === 'error') break
            } catch {
              if (data) {
                result += data
                setStreamingText(result)
              }
            }
          }
        }
        if (result) {
          onAppendMessage({ role: 'assistant', text: result, model })
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return
        onAppendMessage({
          role: 'assistant',
          text: `Error: ${err instanceof Error ? err.message : 'Request failed'}`,
        })
      } finally {
        setStreaming(false)
        setStreamingText('')
      }
    } else {
      onAppendMessage({ role: 'user', text })
      await onSend(text, mode, model, selectedPreset, scratchpad, councilMode)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const toggleScratchpad = () => {
    const next = !scratchpadVisible
    setScratchpadVisible(next)
    onSettingsChange({ ...settings, scratchpadVisible: next })
  }

  const hasProgress = !!councilProgress

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {messages.length === 0 && !streaming && !hasProgress && (
            <div className="flex flex-col items-center justify-center pt-16 text-center text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-council-400 to-council-600 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-lg">
                C
              </div>
              <div className="text-sm font-medium text-gray-500">Research Writing Council</div>
              <div className="text-xs mt-1 text-gray-400 max-w-xs">
                A multi-model editorial board for scientific writing.
                Submit a passage below for independent review.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%]`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-council-500 text-white rounded-br-md'
                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <span className="whitespace-pre-wrap">{msg.text}</span>
                  ) : msg.council ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wider">
                        <span>Council Result</span>
                        {msg.preset_label && (
                          <>
                            <span>{"\u00B7"}</span>
                            <span className="text-gray-500">{msg.preset_label}</span>
                          </>
                        )}
                      </div>
                      <CouncilResult result={msg.council} />
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  )}
                </div>
                {msg.model && msg.role === 'assistant' && !msg.council && (
                  <div className="text-[10px] text-gray-400 mt-1 px-4">
                    {msg.model.provider}/{msg.model.model}
                  </div>
                )}
              </div>
            </div>
          ))}

          {hasProgress && (
            <div className="flex justify-start">
              <div className="max-w-[85%] sm:max-w-[75%]">
                <div className="bg-white border border-council-200 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm shadow-sm">
                  <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                    <span>Council in Progress{councilMode === 'debate' ? ' (Debate)' : ''}</span>
                    <span className="text-green-600">
                      {councilProgress!.members.length > 0
                        ? `${councilProgress!.members.length} member${councilProgress!.members.length !== 1 ? 's' : ''}${councilProgress!.critiques && councilProgress!.critiques.length > 0 ? `, ${councilProgress!.critiques.length} critique${councilProgress!.critiques.length !== 1 ? 's' : ''}` : ''}${councilProgress!.chair ? ', chair done' : ''}`
                        : 'waiting for responses...'}
                    </span>
                    {councilProgress!.members.length === 0 && (
                      <div className="flex gap-0.5 ml-1">
                        <span className="w-1 h-3 bg-council-400 animate-pulse rounded" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-3 bg-council-400 animate-pulse rounded" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-3 bg-council-400 animate-pulse rounded" style={{ animationDelay: '300ms' }} />
                      </div>
                    )}
                  </div>
                  <CouncilResult result={councilProgress!} inProgress={true} />
                </div>
              </div>
            </div>
          )}
          {loading && !hasProgress && !streaming && messages.length > 0 && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                <div className="flex gap-1">
                  <span className="w-1.5 h-4 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-4 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-4 bg-gray-300 animate-pulse rounded" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {streaming && (
            <div className="flex justify-start">
              <div className="max-w-[85%] sm:max-w-[75%]">
                <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed text-gray-800 shadow-sm">
                  {streamingText ? (
                    <>
                      <span className="whitespace-pre-wrap">{streamingText}</span>
                      <span className="inline-block w-1.5 h-4 bg-council-400 animate-pulse rounded ml-0.5 align-middle" />
                    </>
                  ) : (
                    <div className="flex gap-1 py-1">
                      <span className="w-1.5 h-4 bg-council-400 animate-pulse rounded" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-4 bg-council-400 animate-pulse rounded" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-4 bg-council-400 animate-pulse rounded" style={{ animationDelay: '300ms' }} />
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-400 mt-1 px-4">
                  {model.provider}/{model.model}
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          <Scratchpad
            value={scratchpad}
            onChange={setScratchpad}
            visible={scratchpadVisible}
            onToggle={toggleScratchpad}
          />
          <div className="flex items-center gap-2">
            <ModelToggle
              mode={mode}
              onModeChange={setMode}
              model={model}
              onModelChange={setModel}
              presets={presets}
              selectedPreset={selectedPreset}
              onPresetChange={setSelectedPreset}
              settings={settings}
              models={models}
            />
            {mode === 'council' && (
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  onClick={() => setCouncilMode('council')}
                  className={`px-2 py-1.5 text-[10px] font-medium transition-colors
                    ${councilMode === 'council'
                      ? 'bg-council-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="3-stage: independent reviews → critique → chair"
                >
                  Council
                </button>
                <button
                  onClick={() => setCouncilMode('debate')}
                  className={`px-2 py-1.5 text-[10px] font-medium transition-colors
                    ${councilMode === 'debate'
                      ? 'bg-council-500 text-white'
                      : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  title="4-round: reviews → critique → revision → final critique → chair"
                >
                  Debate
                </button>
              </div>
            )}
            <div className="flex-1" />
            <button
              onClick={onOpenSettings}
              className="text-gray-400 hover:text-gray-600 p-1 transition-colors"
              title="Settings"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="8" cy="8" r="2.5" />
                <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
              </svg>
            </button>
          </div>
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'single' ? 'Ask about your manuscript...' : 'Submit a passage for council review...'}
              rows={1}
              className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-council-400 focus:border-transparent"
            />
            <button
              onClick={handleSend}
              disabled={streaming || !input.trim()}
              className="px-4 py-2.5 bg-council-500 text-white rounded-xl text-sm font-medium hover:bg-council-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {mode === 'single' ? 'Send' : 'Consult'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
