"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Vote, Zap, Calendar, ArrowRight, Sparkles, Mic, Send, Square, Loader2, RotateCcw, Trash2, Link2, BookOpen, Settings, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from 'react-markdown';

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  command?: any
  status?: 'pending' | 'success' | 'error'
  errorDetail?: string
}

const MAX_RETRIES = 5

function Sidebar({ isOpen, setIsOpen, setIsAuthenticated }: { isOpen: boolean, setIsOpen: (v: boolean) => void, setIsAuthenticated: (v: boolean | null) => void }) {
  const tools = [
    { name: '闪念笔记', icon: Zap, href: '/tools/ideas', desc: '极速随身便签' },
    { name: '投票收集', icon: Vote, href: '/tools/polls', desc: '匿名投票征集' },
    { name: '日程调度', icon: Calendar, href: '/tools/scheduler', desc: '定时或重复任务' },
    { name: '外部接口', icon: Link2, href: '/tools/api', desc: '系统API集成' },
    { name: '系统设置', icon: Settings, href: '/settings', desc: '密钥与账号管理' },
    { name: '使用帮助', icon: BookOpen, href: '/help', desc: '指令说明与帮助' },
  ];

  const handleLogout = async () => {
    try {
      await fetch('/api/auth', { method: 'DELETE' });
      setIsAuthenticated(false);
    } catch { }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar sidebar */}
      <div className={cn(
        "fixed md:static inset-y-0 left-0 z-50 w-64 bg-secondary/30 backdrop-blur-xl border-r border-border/50 flex flex-col transition-transform duration-300 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Sparkles size={16} className="text-primary" />
            </div>
            <span className="font-bold text-lg tracking-tight">Magic Ball</span>
          </div>
          <Button variant="ghost" size="icon" className="md:hidden rounded-full" onClick={() => setIsOpen(false)}>
            <X size={20} />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          <div className="text-xs font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">
            工具箱
          </div>
          {tools.map((t, i) => (
            <Link key={i} href={t.href} onClick={() => setIsOpen(false)} className="block outline-none">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-secondary/50 text-foreground/80 hover:text-foreground transition-all group">
                <div className="p-1.5 rounded-lg bg-background border border-border/50 group-hover:border-primary/30 group-hover:text-primary transition-colors">
                  <t.icon size={16} />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{t.name}</span>
                  <span className="text-[10px] text-muted-foreground">{t.desc}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="p-4 border-t border-border/50">
          <Button variant="outline" className="w-full justify-center rounded-xl bg-background/50 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all text-sm h-10" onClick={handleLogout}>
            退出登录
          </Button>
        </div>
      </div>
    </>
  );
}

function AICommandCenter() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const isLoadedRef = useRef(false)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (isLoadedRef.current) return
    isLoadedRef.current = true
    fetch('/api/messages').then(r => r.json()).then(data => {
      if (data.success && data.data) {
        setMessages(data.data.map((m: any) => ({
          role: m.source === 'user' ? 'user' : 'assistant',
          text: m.content || '',
          status: 'success'
        })))
      }
    }).catch(() => { })
  }, [])

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
    if (status === 'success' || status === 'error') {
      fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, source: 'ai' })
      }).catch(() => { })
    }
  }

  const buildApiMessages = (history: ChatMessage[], newUserText?: string) => {
    const apiMessages: { role: string; text: string }[] = []
    for (const m of history) {
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

  const callAI = async (apiMessages: { role: string; text: string }[], audio?: string) => {
    const res = await fetch("/api/ai/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: apiMessages, audio })
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error || '请求失败')
    return { transcript: data.transcript as string | null, actions: data.actions as any[] }
  }

  const handleSendAudio = async (base64Audio: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    // Placeholder — will be updated with transcript
    const userMsg: ChatMessage = { role: 'user', text: '🎤 识别中...' }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)

    try {
      const apiMessages = buildApiMessages(newHistory)
      const { transcript, actions } = await callAI(apiMessages, base64Audio)

      // Update user bubble with transcript
      if (transcript) {
        setMessages(prev => prev.map((m, i) =>
          i === prev.length - actions.length - 1 && m.text === '🎤 识别中...'
            ? { ...m, text: `🎤 "${transcript}"` }
            : m
        ))
        // Also update the history entry for future context
        userMsg.text = transcript
      }

      // Execute all actions
      for (const cmd of actions) {
        if (cmd.action === 'chat') {
          addAssistantMessage(cmd.message, 'success', cmd)
        } else {
          const result = await executeCommand(cmd)
          addAssistantMessage(result.message, result.ok ? 'success' : 'error', cmd)
        }
      }
    } catch (err: any) {
      addAssistantMessage(`❌ ${err.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const executeCommand = async (cmd: any): Promise<{ ok: boolean; message: string }> => {
    try {
      switch (cmd.action) {
        case 'create_idea': {
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
          if (res.ok) return { ok: true, message: `🚀 已触发外部自动化工作流: ${cmd.event}` }
          const err = await res.json().catch(() => ({}))
          return { ok: false, message: `外部工作流触发失败: ${(err as any).error || res.statusText}` }
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
    const userText = (text || input).trim()
    if (!userText || isProcessing) return
    setInput("")

    const userMsg: ChatMessage = { role: 'user', text: userText }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setIsProcessing(true)

    // Save user message to DB
    fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: userText, source: 'user' })
    }).catch(() => { })

    try {
      let currentHistory = newHistory
      let retryCount = 0

      while (retryCount < MAX_RETRIES) {
        const apiMessages = buildApiMessages(currentHistory)
        const { actions } = await callAI(apiMessages)

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
      addAssistantMessage(`❌ ${err.message}`, 'error')
    } finally {
      setIsProcessing(false)
    }
  }

  const clearChat = async () => {
    setMessages([])
    try {
      await fetch('/api/messages', { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to clear chat history:', err)
    }
  }

  return (
    <div className="flex flex-col h-full bg-background relative z-10">
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
                    ? "bg-red-500/10 text-red-400 border border-red-500/20 rounded-bl-sm"
                    : m.status === 'success' && m.command?.action !== 'chat'
                      ? "bg-secondary/40 text-foreground border border-border/30 rounded-bl-sm"
                      : "bg-transparent text-foreground"
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
        <div className="max-w-4xl mx-auto flex items-end gap-2 relative">
          <div className="absolute -top-10 left-2 flex items-center gap-2">
            <button onClick={() => {
              setIsProcessing(true)
              fetch('/api/messages').then(r => r.json()).then(data => {
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
              <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium text-muted-foreground hover:text-red-400 hover:bg-secondary transition-all shadow-sm border border-border/50">
                <Trash2 size={12} />
                <span>清空</span>
              </button>
            )}
          </div>

          <div className="flex-1 relative bg-secondary/30 border border-border/50 rounded-3xl shadow-sm focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30 transition-all flex items-center min-h-[56px] pl-4 pr-1">
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
            {input.trim() ? (
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
        </div>
        <div className="text-center mt-2.5">
          <p className="text-[10px] text-muted-foreground/60 w-full text-center">
            AI 可能会犯错，复杂的自动化任务请在大屏幕上检查运行结果。
          </p>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then((d: any) => {
      setIsAuthenticated(d.authenticated === true)
    }).catch(() => setIsAuthenticated(false))
  }, [])

  // Client-side trigger polling — check for due tasks every 60s
  useEffect(() => {
    if (isAuthenticated !== true) return
    const checkTriggers = async () => {
      try {
        await fetch('/api/scheduler/trigger', { method: 'POST' })
      } catch { }
    }
    checkTriggers() // initial check
    const interval = setInterval(checkTriggers, 60000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  if (isAuthenticated === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Dynamic Background Blob */}
      <div className="fixed top-[-20%] left-[-10%] w-[50%] h-[50%] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[100px] pointer-events-none" />

      {isAuthenticated && (
        <Sidebar
          isOpen={isSidebarOpen}
          setIsOpen={setIsSidebarOpen}
          setIsAuthenticated={setIsAuthenticated}
        />
      )}

      <main className="flex-1 flex flex-col min-w-0 h-full relative z-10">
        {/* Mobile Header */}
        {isAuthenticated && (
          <div className="md:hidden flex items-center justify-between p-4 border-b border-border/50 bg-background/80 backdrop-blur-xl z-20">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
                <Sparkles size={14} className="text-primary" />
              </div>
              <span className="font-bold tracking-tight text-base">Magic Ball</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsSidebarOpen(true)} className="rounded-full">
              <Menu size={20} />
            </Button>
          </div>
        )}

        {isAuthenticated ? (
          <AICommandCenter />
        ) : (
          <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto p-6 text-center animate-in fade-in zoom-in-95 duration-500">
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
            <Link href="/settings" className="w-full">
              <Button size="lg" className="w-full rounded-2xl h-14 text-base font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-all">
                配置密钥进入系统 <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
