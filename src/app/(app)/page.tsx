"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Vote, Zap, Calendar, ArrowRight, Sparkles, Mic, Send, Square, Loader2, RotateCcw, Trash2, Link2, BookOpen, Settings, Menu, X, ImagePlus, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';
import { evaluateCreateIdeaIntent } from "@/lib/ideaGuard";

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  command?: any
  status?: 'pending' | 'success' | 'error'
  errorDetail?: string
}

interface PendingImage {
  dataUrl: string
  base64: string
  mimeType: string
}

interface SessionSummary {
  sessionId: string
  lastContent: string
  createdAt: number
  messageCount: number
}

interface SystemFeedMessage {
  id: string
  content: string
  createdAt: number
  source: string
}

const MAX_RETRIES = 5
const getSessionCacheKey = (sid: string) => `magic_ball_messages_${sid}`
const sanitizeAiText = (text: string) => text.replace(/```json|```/gi, '').trim()
const extractNaturalChatMessage = (raw: string) => {
  const cleaned = sanitizeAiText(raw)
  const match = cleaned.match(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/)
  if (match?.[1]) {
    return match[1]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .trim()
  }
  return cleaned
}
const extractWorkflowMessage = (data: any, fallbackEvent: string) => {
  if (!data) return `🚀 已触发外部自动化工作流: ${fallbackEvent}`
  if (typeof data.message === 'string' && data.message.trim()) return data.message
  if (typeof data.data === 'string' && data.data.trim()) return data.data
  if (typeof data.result === 'string' && data.result.trim()) return data.result
  return `🚀 已触发外部自动化工作流: ${fallbackEvent}`
}

// Sidebar removed in favor of global AppLayout Sidebar.
function AICommandCenter({ sessionId, setSessionId }: { sessionId: string, setSessionId: (id: string) => void }) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [historyLimit, setHistoryLimit] = useState(50)
  const [historyWarnThreshold, setHistoryWarnThreshold] = useState(80)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [showSessions, setShowSessions] = useState(false)
  const [sessionSearch, setSessionSearch] = useState("")
  const [showSystemFeed, setShowSystemFeed] = useState(false)
  const [systemFeed, setSystemFeed] = useState<SystemFeedMessage[]>([])
  const [isLoadingSystemFeed, setIsLoadingSystemFeed] = useState(false)
  const [persistenceWarning, setPersistenceWarning] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const imageInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const isProcessingRef = useRef(false)
  const router = useRouter()
  const warnedSessionsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    isProcessingRef.current = isProcessing
  }, [isProcessing])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const loadMessages = () => {
      if (isProcessingRef.current) return
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(getSessionCacheKey(sessionId))
        if (cached) {
          try {
            setMessages(JSON.parse(cached))
          } catch { }
        }
      }

      fetch(`/api/messages?sessionId=${sessionId}`, { cache: 'no-store' }).then(r => r.json()).then(data => {
        if (data.success && data.data) {
          const nextMessages = data.data.map((m: any) => ({
            role: m.source === 'user' ? 'user' : 'assistant',
            text: m.content || '',
            status: 'success'
          }))
          setMessages(nextMessages)
          if (typeof window !== 'undefined') {
            localStorage.setItem(getSessionCacheKey(sessionId), JSON.stringify(nextMessages))
          }
        }
      }).catch(() => { })
    }

    loadMessages()

    const interval = window.setInterval(loadMessages, 15000)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') loadMessages()
    }

    window.addEventListener('scheduler_triggered', loadMessages)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('scheduler_triggered', loadMessages)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.clearInterval(interval)
    }
  }, [sessionId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const stableMessages = messages.filter(m => m.status !== 'pending')
    localStorage.setItem(getSessionCacheKey(sessionId), JSON.stringify(stableMessages))
  }, [messages, sessionId])

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then(r => r.json())
      .then((data: any) => {
        if (!data?.success || !data?.data) return
        const rawLimit = Number(data.data.chat_history_limit)
        const rawWarn = Number(data.data.chat_history_warn_threshold)
        if (Number.isFinite(rawLimit) && rawLimit > 0) setHistoryLimit(Math.floor(rawLimit))
        if (Number.isFinite(rawWarn) && rawWarn > 0) setHistoryWarnThreshold(Math.floor(rawWarn))
      })
      .catch(() => { })
  }, [])

  const loadSessions = () => {
    fetch('/api/messages/sessions', { cache: 'no-store' }).then(r => r.json()).then(data => {
      if (data.success && data.data) {
        setSessions(data.data)
      }
    }).catch(() => { })
  }

  useEffect(() => {
    if (showSessions) loadSessions()
  }, [showSessions])

  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = (showSessions || showSystemFeed) ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [showSessions, showSystemFeed])

  const loadSystemFeed = async () => {
    setIsLoadingSystemFeed(true)
    try {
      const res = await fetch('/api/messages/system', { cache: 'no-store' })
      const data = await res.json()
      if (data?.success && Array.isArray(data.data)) {
        setSystemFeed(data.data)
      }
    } catch {
      setSystemFeed([])
    } finally {
      setIsLoadingSystemFeed(false)
    }
  }

  useEffect(() => {
    if (showSystemFeed) loadSystemFeed()
  }, [showSystemFeed])

  const deleteSession = async (sid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('确定要删除这段对话历史吗？')) return

    try {
      const res = await fetch(`/api/messages/sessions?sessionId=${sid}`, { method: 'DELETE' })
      if (res.ok) {
        if (sid === sessionId) {
          createNewChat()
        }
        loadSessions()
      }
    } catch (e) {
      console.error("Failed to delete session", e)
    }
  }

  const silenceTimerRef = useRef<any>(null)
  const analyserCleanupRef = useRef<(() => void) | null>(null)

  const stopRecording = () => {
    if (silenceTimerRef.current) { clearInterval(silenceTimerRef.current); silenceTimerRef.current = null }
    if (analyserCleanupRef.current) { analyserCleanupRef.current(); analyserCleanupRef.current = null }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setIsRecording(false)

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const reader = new FileReader()
        reader.readAsDataURL(audioBlob)
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            const base64 = reader.result.split(',')[1]
            handleSendAudio(base64)
          }
        }
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)

      // --- Silence detection via Web Audio API ---
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const dataArray = new Uint8Array(analyser.fftSize)

      let silentSince: number | null = null
      const SILENCE_THRESHOLD = 10   // volume level below which = silence
      const SILENCE_DURATION = 2000  // 2s of silence → auto stop

      silenceTimerRef.current = setInterval(() => {
        analyser.getByteTimeDomainData(dataArray)
        let maxDev = 0
        for (let i = 0; i < dataArray.length; i++) {
          const d = Math.abs(dataArray[i] - 128)
          if (d > maxDev) maxDev = d
        }
        if (maxDev < SILENCE_THRESHOLD) {
          if (!silentSince) silentSince = Date.now()
          else if (Date.now() - silentSince >= SILENCE_DURATION) {
            stopRecording()
          }
        } else {
          silentSince = null
        }
      }, 200)

      analyserCleanupRef.current = () => {
        source.disconnect()
        audioCtx.close()
      }
    } catch (err) {
      addAssistantMessage('无法访问麦克风，请检查权限设置。', 'error')
    }
  }

  const addAssistantMessage = (text: string, status: 'success' | 'error' | 'pending' = 'success', command?: any, errorDetail?: string) => {
    setMessages(prev => [...prev, { role: 'assistant', text, command, status, errorDetail }])
    persistMessage({ content: text, source: 'ai', sessionId })
  }

  const persistMessage = async (payload: { content: string; source: 'user' | 'ai' | 'system'; sessionId: string }) => {
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).error || res.statusText || `HTTP ${res.status}`)
      }
      setPersistenceWarning(null)
      if (showSessions) loadSessions()
    } catch (e) {
      console.error('Failed to persist message:', e)
      setPersistenceWarning('会话消息写入失败：当前消息可能只在本地显示，历史会话统计可能不完整。请检查登录状态或网络后重试。')
    }
  }

  const buildApiMessages = (history: ChatMessage[], newUserText?: string) => {
    const slicedHistory = history.slice(-Math.max(1, historyLimit))
    const apiMessages: { role: string; text: string }[] = []
    for (const m of slicedHistory) {
      if (m.role === 'user') {
        apiMessages.push({ role: 'user', text: m.text })
      } else {
        // Send the AI's command JSON or chat text
        const t = m.command ? JSON.stringify(m.command) : m.text
        apiMessages.push({ role: 'assistant', text: t })
      }
    }
    if (newUserText) apiMessages.push({ role: 'user', text: newUserText })
    return apiMessages
  }

  const maybeShowHistoryWarning = (messageCount: number) => {
    if (historyWarnThreshold <= 0) return
    if (messageCount <= historyWarnThreshold) return
    if (warnedSessionsRef.current.has(sessionId)) return

    warnedSessionsRef.current.add(sessionId)
    addAssistantMessage(`提示：当前会话已超过 ${historyWarnThreshold} 条消息。为保证速度与稳定性，AI 仅携带最近 ${historyLimit} 条上下文。`, 'success')
  }

  const callAI = async (
    apiMessages: { role: string; text: string }[],
    audio?: string,
    image?: { data: string; mimeType: string },
    onStream?: (text: string) => void
  ) => {
    const res = await fetch("/api/ai/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiMessages, audio, image })
    });

    if (!res.ok) throw new Error('请求失败');

    // Handle streaming response
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    let isCompleteJson = false;
    let finalData = null;

    if (!reader) throw new Error("无法读取流数据");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;

          try {
            const data = JSON.parse(dataStr);
            const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (textPart) {
              accumulatedText += textPart;
              // Pass the progressive text to the UI
              onStream?.(accumulatedText);

              // Try to parse the accumulated text as JSON to see if it's our action payload
              try {
                finalData = JSON.parse(accumulatedText);
                isCompleteJson = true;
              } catch {
                // Not complete yet, which is expected during streaming
                isCompleteJson = false;
              }
            }
          } catch (e) {
            console.error("Failed to parse SSE chunk", e);
          }
        }
      }
    }

    if (isCompleteJson && finalData) {
      return { transcript: finalData.transcript as string | null, actions: finalData.actions ? finalData.actions : [finalData] as any[] }
    }

    // Fallback: if model output is malformed JSON, extract a natural chat message instead of raw JSON text.
    const fallbackText = extractNaturalChatMessage(accumulatedText || '🤔 AI 返回了无效的格式。')
    return { transcript: null, actions: [{ action: 'chat', message: fallbackText }] }
  }

  const handleSendAudio = async (base64Audio: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    // Placeholder — will be updated with transcript
    const userMsg: ChatMessage = { role: 'user', text: '🎤 识别中...' }
    const streamMsg: ChatMessage = { role: 'assistant', text: '', status: 'pending' }
    const newHistory = [...messages, userMsg]
    maybeShowHistoryWarning(newHistory.length)
    setMessages([...newHistory, streamMsg])

    try {
      const apiMessages = buildApiMessages(newHistory)
      const { transcript, actions } = await callAI(apiMessages, base64Audio, undefined, (incrementalText) => {
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, text: incrementalText } : m
        ))
      })

      // Update user bubble with transcript
      if (transcript) {
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - 2 && m.text === '🎤 识别中...'
            ? { ...m, text: `🎤 "${transcript}"` }
            : m
        ))
        // Also update the history entry for future context
        userMsg.text = transcript
      }

      // Execute all actions
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1)) // remove the temporary streaming bubble
      for (const cmd of actions) {
        if (cmd.action === 'chat') {
          addAssistantMessage(cmd.message, 'success', cmd)
        } else {
          const result = await executeCommand(cmd)
          addAssistantMessage(result.message, result.ok ? 'success' : 'error', cmd)
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.filter((_, i) => i !== prev.length - 1))
      addAssistantMessage(`❌ ${err.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const executeCommand = async (cmd: any): Promise<{ ok: boolean; message: string }> => {
    try {
      switch (cmd.action) {
        case 'create_idea': {
          const intent = evaluateCreateIdeaIntent(cmd)
          if (!intent.allowed) {
            return { ok: false, message: `已拦截创建笔记：${intent.reason}` }
          }
          const tags = cmd.tags || []
          const content = tags.length > 0
            ? cmd.content + ' ' + tags.map((t: string) => `#${t}`).join(' ')
            : cmd.content
          const res = await fetch("/api/ideas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: crypto.randomUUID(), type: "text", content, tags: JSON.stringify(tags), createdAt: Date.now() })
          })
          if (res.ok) return { ok: true, message: `✅ 已记录闪念: "${cmd.content}"` }
          const err = await res.json().catch(() => ({}))
          return { ok: false, message: `创建笔记失败: ${(err as any).error || res.statusText}` }
        }
        case 'create_poll': {
          const res = await fetch("/api/polls", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: cmd.title, description: cmd.description || null, type: cmd.type, options: cmd.options || [], accessCode: cmd.accessCode || null })
          })
          if (res.ok) return { ok: true, message: `✅ 已创建投票: "${cmd.title}"` }
          const err = await res.json().catch(() => ({}))
          return { ok: false, message: `创建投票失败: ${(err as any).error || res.statusText}` }
        }
        case 'navigate':
          router.push(cmd.path)
          return { ok: true, message: `🚀 正在跳转到 ${cmd.path}` }
        case 'schedule_task': {
          const res = await fetch('/api/scheduler', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: cmd.title,
              triggerAt: cmd.triggerAt,
              recurrence: cmd.recurrence || null,
              actionType: cmd.scheduledAction?.action || cmd.taskAction || 'reminder',
              actionPayload: cmd.scheduledAction || cmd.taskPayload || { action: 'reminder', message: cmd.title },
            })
          })
          if (res.ok) return { ok: true, message: `📅 已创建定时任务: "${cmd.title}"` }
          const err = await res.json().catch(() => ({}))
          return { ok: false, message: `创建任务失败: ${(err as any).error || res.statusText}` }
        }
        case 'list_tasks': {
          const res = await fetch('/api/scheduler?status=active')
          const data = await res.json()
          if (data.success && data.data) {
            const taskList = data.data.length === 0 ? '当前没有定时任务。' :
              data.data.map((t: any) => `• ${t.title} — ${new Date(t.triggerAt).toLocaleString('zh-CN')}${t.recurrence ? ` (${t.recurrence})` : ''}`).join('\n')
            return { ok: true, message: `📋 当前任务:\n${taskList}` }
          }
          return { ok: false, message: '获取任务列表失败' }
        }
        case 'cancel_task': {
          const res = await fetch(`/api/scheduler?id=${cmd.taskId}`, { method: 'DELETE' })
          if (res.ok) return { ok: true, message: `🗑️ 任务已取消` }
          return { ok: false, message: '取消任务失败' }
        }
        case 'trigger_external_workflow': {
          const res = await fetch("/api/external-workflow", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ event: cmd.event, payload: cmd.payload })
          })
          const data = await res.json().catch(() => ({}))
          if (res.ok) return { ok: true, message: extractWorkflowMessage(data, cmd.event || 'default_event') }
          return { ok: false, message: `外部工作流触发失败: ${(data as any).error || res.statusText}` }
        }
        case 'chat':
          return { ok: true, message: cmd.message || '好的' }
        default:
          return { ok: false, message: `未知操作类型: ${cmd.action}` }
      }
    } catch (err: any) {
      return { ok: false, message: `执行出错: ${err.message}` }
    }
  }

  const handleSend = async (text?: string) => {
    const typedText = (text || input).trim()
    const imageForSend = pendingImage
    if ((!typedText && !imageForSend) || isProcessing) return

    const userText = typedText || '请分析这张图片'
    const displayText = imageForSend ? `🖼️ ${userText}` : userText
    setInput("")
    setPendingImage(null)

    const userMsg: ChatMessage = { role: 'user', text: displayText }
    const newHistory = [...messages, userMsg]
    maybeShowHistoryWarning(newHistory.length)
    setMessages(newHistory)
    setIsProcessing(true)

    // Save user message to DB
    void persistMessage({ content: displayText, source: 'user', sessionId })

    try {
      let currentHistory = newHistory
      let retryCount = 0

      while (retryCount < MAX_RETRIES) {
        const streamMsg: ChatMessage = { role: 'assistant', text: '', status: 'pending' }
        setMessages(prev => [...prev, streamMsg])

        const apiMessages = buildApiMessages(currentHistory)
        const { actions } = await callAI(
          apiMessages,
          undefined,
          imageForSend ? { data: imageForSend.base64, mimeType: imageForSend.mimeType } : undefined,
          (incrementalText) => {
          setMessages(prev => prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, text: incrementalText } : m
          ))
          }
        )

        setMessages(prev => prev.filter((_, i) => i !== prev.length - 1)) // clear temporary streaming message before action execution

        // Execute all actions sequentially
        let allOk = true
        let failedCmd: any = null
        let failedMsg = ''

        for (const cmd of actions) {
          if (cmd.action === 'chat') {
            addAssistantMessage(cmd.message, 'success', cmd)
          } else {
            const result = await executeCommand(cmd)
            addAssistantMessage(result.message, result.ok ? 'success' : 'error', cmd)
            if (!result.ok) {
              allOk = false
              failedCmd = cmd
              failedMsg = result.message
              break // stop executing remaining actions on failure
            }
          }
        }

        if (allOk) break

        // Retry on failure
        retryCount++
        const errorFeedback = `执行命令失败 (第${retryCount}次尝试)。错误信息: ${failedMsg}。失败的命令是: ${JSON.stringify(failedCmd)}。请分析问题并调整命令重试。`
        const failInfo: ChatMessage = { role: 'assistant', text: `⚠️ 正在重试 (${retryCount}/${MAX_RETRIES})...`, status: 'error' }
        setMessages(prev => [...prev, failInfo])
        currentHistory = [...currentHistory, failInfo, { role: 'user', text: errorFeedback }]

        if (retryCount >= MAX_RETRIES) {
          addAssistantMessage(`❌ 已尝试 ${MAX_RETRIES} 次仍然失败，请检查问题或手动操作。`, 'error')
        }
      }
    } catch (err: any) {
      setMessages(prev => prev.filter((m) => m.status !== 'pending'))
      addAssistantMessage(`❌ ${err.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const createNewChat = () => {
    setMessages([])
    const newSid = crypto.randomUUID()
    localStorage.setItem(getSessionCacheKey(newSid), JSON.stringify([]))
    localStorage.setItem('magic_ball_session_id', newSid)
    setSessionId(newSid)
  }

  const filteredSessions = sessions.filter((s) => {
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return true
    return (
      s.sessionId.toLowerCase().includes(q) ||
      (s.lastContent || '').toLowerCase().includes(q)
    )
  })

  const handleImageSelect = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      addAssistantMessage('仅支持上传图片文件。', 'error')
      return
    }

    try {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onloadend = () => {
        if (typeof reader.result !== 'string') return
        const base64 = reader.result.split(',')[1]
        if (!base64) {
          addAssistantMessage('图片读取失败，请重试。', 'error')
          return
        }
        setPendingImage({
          dataUrl: reader.result,
          base64,
          mimeType: file.type || 'image/jpeg'
        })
      }
    } catch {
      addAssistantMessage('图片读取失败，请重试。', 'error')
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent relative z-10 -m-4 md:-m-6 lg:-m-8">
      {/* Messages Area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6 scroll-smooth"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-60 animate-in fade-in zoom-in duration-700">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <Sparkles size={32} className="text-primary" />
            </div>
            <h2 className="text-2xl font-semibold mb-2 tracking-tight">有什么我可以帮您？</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              试着说「记一下明天开会」、「帮我发个出游投票」或「每天提醒我喝水」。
            </p>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={cn("flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300", m.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] md:max-w-[75%] px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed",
                m.role === 'user'
                  ? "bg-primary text-primary-foreground rounded-br-sm shadow-md shadow-primary/10"
                  : m.status === 'error'
                    ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-bl-sm"
                    : "bg-secondary/40 text-foreground border border-border/30 rounded-bl-sm"
              )}>
                {m.role === 'assistant' && (m.status === 'success' || m.status === 'error') ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-secondary prose-pre:border prose-pre:border-border/50">
                    <ReactMarkdown>{m.text}</ReactMarkdown>
                  </div>
                ) : (
                  <span className="whitespace-pre-wrap">{m.text}</span>
                )}
              </div>
            </div>
          ))
        )}

        {isProcessing && (
          <div className="flex justify-start w-full animate-in fade-in">
            <div className="flex items-center gap-2 px-4 py-3 rounded-3xl rounded-bl-sm text-muted-foreground bg-transparent">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary/80 animate-bounce" style={{ animationDelay: '300ms' }} />
              </span>
            </div>
          </div>
        )}
        <div className="h-4" /> {/* Bottom spacer */}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background/80 backdrop-blur-xl border-t border-border/50 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {persistenceWarning && (
          <div className="max-w-4xl mx-auto mb-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {persistenceWarning}
          </div>
        )}
        <div className="max-w-4xl mx-auto flex items-end gap-2 relative">
          <div className="absolute -top-10 left-2 flex items-center gap-2">
            <button
              onClick={() => setShowSessions(!showSessions)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border",
                showSessions
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/80 text-muted-foreground hover:text-foreground hover:bg-secondary border-border/50"
              )}
            >
              <BookOpen size={12} />
              <span>历史会话</span>
            </button>
            <button
              onClick={() => setShowSystemFeed(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-sm border border-border/50"
            >
              <BellRing size={12} />
              <span>系统消息</span>
            </button>
            <button onClick={() => {
              setIsProcessing(true)
              fetch(`/api/messages?sessionId=${sessionId}`, { cache: 'no-store' }).then(r => r.json()).then(data => {
                if (data.success && data.data) {
                  setMessages(data.data.map((m: any) => ({
                    role: m.source === 'user' ? 'user' : 'assistant',
                    text: m.content || '',
                    status: 'success'
                  })))
                }
              }).finally(() => setIsProcessing(false))
            }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-sm border border-border/50">
              <RotateCcw size={12} className={isProcessing ? "animate-spin" : ""} />
              <span>同步</span>
            </button>
            {messages.length > 0 && (
              <button onClick={createNewChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-all shadow-sm border border-border/50">
                <Trash2 size={12} />
                <span>新对话</span>
              </button>
            )}
          </div>

          <div className="flex-1 relative bg-secondary/30 border border-border/50 rounded-3xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all flex items-center min-h-[56px] pl-4 pr-1">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                handleImageSelect(file)
                e.currentTarget.value = ''
              }}
            />
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isProcessing || isRecording}
              className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-all mr-1 disabled:opacity-50"
              title="拍照或上传图片"
            >
              <ImagePlus size={18} />
            </button>
            <textarea
              value={input}
              onChange={e => {
                setInput(e.target.value);
                e.target.style.height = 'auto'; // Reset height
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'; // Expand up to 150px
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                  e.currentTarget.style.height = 'auto';
                }
              }}
              placeholder="给 Magic Ball 发送消息..."
              disabled={isProcessing || isRecording}
              className="flex-1 bg-transparent border-none py-4 text-[15px] outline-none disabled:opacity-50 resize-none max-h-[150px] min-h-[24px] overflow-y-auto scrollbar-hide"
              rows={1}
            />
            {(input.trim() || pendingImage) ? (
              <Button
                onClick={() => handleSend()}
                disabled={isProcessing}
                size="icon"
                className="rounded-full h-10 w-10 shrink-0 ml-2 animate-in zoom-in duration-200"
              >
                <Send size={18} />
              </Button>
            ) : (
              <button
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isProcessing}
                className={cn(
                  "h-10 w-10 shrink-0 ml-2 rounded-full flex items-center justify-center transition-all",
                  isRecording
                    ? "bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                    : "bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                {isRecording ? <Square size={16} fill="currentColor" /> : <Mic size={20} />}
              </button>
            )}
          </div>
          {pendingImage && (
            <div className="absolute bottom-full mb-2 left-12 rounded-xl border border-border/50 bg-background/90 p-2 shadow-lg">
              <div className="relative">
                <img src={pendingImage.dataUrl} alt="待发送图片" className="w-24 h-24 object-cover rounded-lg" />
                <button
                  onClick={() => setPendingImage(null)}
                  className="absolute -top-2 -right-2 bg-background border border-border rounded-full p-1 text-muted-foreground hover:text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            </div>
          )}
        </div>
        <div className="text-center mt-2.5">
          <p className="text-[10px] text-muted-foreground/60 w-full text-center">
            AI 可能会犯错，复杂的自动化任务请在大屏幕上检查运行结果。
          </p>
        </div>
      </div>

      {showSessions && (
        <div className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-sm p-4 md:p-8">
          <div className="mx-auto h-full w-full max-w-5xl rounded-3xl border border-border/50 bg-background/95 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 md:p-5 border-b border-border/50 flex items-center gap-3">
              <div>
                <div className="text-base md:text-lg font-semibold tracking-tight">历史会话</div>
                <div className="text-xs text-muted-foreground">
                  共 {sessions.length} 个会话，当前筛选 {filteredSessions.length} 个
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <input
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="搜索会话ID或内容..."
                  className="h-9 w-44 md:w-72 rounded-xl border border-border/50 bg-secondary/50 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button
                  onClick={() => setShowSessions(false)}
                  className="h-9 w-9 rounded-xl border border-border/50 bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              {filteredSessions.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  没有匹配到历史会话
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredSessions.map((s) => (
                    <div
                      key={s.sessionId}
                      className={cn(
                        "rounded-2xl border p-3 md:p-4 transition-all",
                        s.sessionId === sessionId
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/50 bg-secondary/20"
                      )}
                    >
                      <button
                        onClick={() => {
                          setSessionId(s.sessionId)
                          localStorage.setItem('magic_ball_session_id', s.sessionId)
                          setShowSessions(false)
                        }}
                        className="w-full text-left"
                      >
                        <div className="text-sm font-semibold line-clamp-2 min-h-10">
                          {s.lastContent || '空对话'}
                        </div>
                        <div className="mt-2 text-[11px] text-muted-foreground">
                          <div>ID: {s.sessionId}</div>
                          <div>{new Date(s.createdAt).toLocaleString('zh-CN')}</div>
                          <div>{s.messageCount} 条消息</div>
                        </div>
                      </button>
                      <div className="mt-3 flex justify-end">
                        <button
                          onClick={(e) => deleteSession(s.sessionId, e)}
                          className="h-8 px-2.5 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 text-xs inline-flex items-center gap-1.5"
                        >
                          <Trash2 size={13} />
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showSystemFeed && (
        <div className="fixed inset-0 z-[110] bg-black/45 backdrop-blur-sm p-4 md:p-8">
          <div className="mx-auto h-full w-full max-w-4xl rounded-3xl border border-border/50 bg-background/95 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 md:p-5 border-b border-border/50 flex items-center gap-3">
              <div>
                <div className="text-base md:text-lg font-semibold tracking-tight">系统消息</div>
                <div className="text-xs text-muted-foreground">定时任务、系统通知等独立展示，不混入聊天会话</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={loadSystemFeed}
                  className="h-9 px-3 rounded-xl border border-border/50 bg-secondary/60 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary inline-flex items-center gap-1.5"
                >
                  <RotateCcw size={12} className={isLoadingSystemFeed ? "animate-spin" : ""} />
                  刷新
                </button>
                <button
                  onClick={() => setShowSystemFeed(false)}
                  className="h-9 w-9 rounded-xl border border-border/50 bg-secondary/60 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2">
              {isLoadingSystemFeed ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">加载中...</div>
              ) : systemFeed.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">暂无系统消息</div>
              ) : (
                systemFeed.map((m) => (
                  <div key={m.id} className="rounded-xl border border-border/50 bg-secondary/20 p-3">
                    <div className="text-[11px] text-muted-foreground mb-1.5">
                      {new Date(m.createdAt).toLocaleString('zh-CN')}
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [sessionId, setSessionId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('magic_ball_session_id') || 'default'
    }
    return 'default'
  })

  useEffect(() => {
    fetch("/api/auth", { cache: 'no-store' }).then(r => r.json()).then((d: any) => {
      setIsAuthenticated(d.authenticated === true)
    }).catch(() => setIsAuthenticated(false))
  }, [])

  useEffect(() => {
    if (isAuthenticated !== true) return
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'active_chat_session_id', value: sessionId }),
    }).catch(() => { })
  }, [isAuthenticated, sessionId])

  // Client-side trigger polling — check for due tasks every 60s
  useEffect(() => {
    if (isAuthenticated !== true) return
    const checkTriggers = async () => {
      try {
        const res = await fetch('/api/scheduler/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId })
        })
        const data = await res.json()
        if (data.success && data.triggered > 0) {
          window.dispatchEvent(new Event('scheduler_triggered'))
        }
      } catch { }
    }
    checkTriggers() // initial check
    const interval = setInterval(checkTriggers, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated, sessionId])

  if (isAuthenticated === null) {
    return (
      <div className="h-[50vh] w-full flex items-center justify-center bg-transparent">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <>
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {isAuthenticated ? (
        <AICommandCenter sessionId={sessionId} setSessionId={setSessionId} />
      ) : (
        <div className="flex flex-col items-center justify-center h-[70vh] max-w-md mx-auto p-6 text-center animate-in fade-in zoom-in-95 duration-500">
          <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-8 relative">
            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-20" />
            <Sparkles size={40} className="text-primary" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-4 text-transparent bg-clip-text bg-gradient-to-br from-foreground to-foreground/70">
            Magic Ball
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            你个人的、高度可扩展的全能效率工具主控台。
          </p>
          <Link href="/settings?intent=settings" className="w-full">
            <Button size="lg" className="w-full rounded-2xl h-14 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
              配置密钥进入系统 <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
        </div>
      )}
    </>
  );
}
