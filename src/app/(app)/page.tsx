"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Vote, Zap, ArrowRight, Sparkles, Mic, Send, Square, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  command?: any
  status?: 'pending' | 'success' | 'error'
  errorDetail?: string
}

const MAX_RETRIES = 5

function AICommandCenter() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

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
    return data.command
  }

  const handleSendAudio = async (base64Audio: string) => {
    if (isProcessing) return
    setIsProcessing(true)

    // Show recording indicator in chat
    const userMsg: ChatMessage = { role: 'user', text: '🎤 [语音输入]' }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)

    try {
      const apiMessages = buildApiMessages(newHistory)
      // Send audio along with history — Gemini processes the audio directly
      const command = await callAI(apiMessages, base64Audio)

      if (command.action === 'chat') {
        setMessages(prev => [...prev, { role: 'assistant', text: command.message, command, status: 'success' }])
      } else {
        const result = await executeCommand(command)
        setMessages(prev => [...prev, { role: 'assistant', text: result.message, command, status: result.ok ? 'success' : 'error' }])
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

    try {
      let currentHistory = newHistory
      let retryCount = 0

      while (retryCount < MAX_RETRIES) {
        // Call AI
        const apiMessages = buildApiMessages(currentHistory)
        const command = await callAI(apiMessages)

        if (command.action === 'chat') {
          // Chat doesn't need execution
          const assistantMsg: ChatMessage = { role: 'assistant', text: command.message, command, status: 'success' }
          setMessages(prev => [...prev, assistantMsg])
          break
        }

        // Try to execute the command
        const result = await executeCommand(command)

        if (result.ok) {
          const assistantMsg: ChatMessage = { role: 'assistant', text: result.message, command, status: 'success' }
          setMessages(prev => [...prev, assistantMsg])
          break
        }

        // Execution failed — feed error back to AI
        retryCount++
        const errorFeedback = `执行命令失败 (第${retryCount}次尝试)。错误信息: ${result.message}。你返回的命令是: ${JSON.stringify(command)}。请分析问题并调整命令重试。`

        const failMsg: ChatMessage = { role: 'assistant', text: `⚠️ ${result.message}（第${retryCount}次尝试，正在重试...）`, command, status: 'error', errorDetail: result.message }
        setMessages(prev => [...prev, failMsg])
        currentHistory = [...currentHistory, failMsg, { role: 'user', text: errorFeedback }]

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

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="p-4 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-xl space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-primary/10 rounded-lg">
          <Sparkles size={16} className="text-primary" />
        </div>
        <span className="text-sm font-semibold">AI 指令中心</span>
        <span className="text-[10px] text-muted-foreground">多轮对话 · 语音/文字</span>
        {messages.length > 0 && (
          <button onClick={clearChat} className="ml-auto text-muted-foreground hover:text-foreground p-1" title="清空对话">
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Chat history */}
      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-64 overflow-y-auto space-y-2 scrollbar-hide">
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === 'user' ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap",
                m.role === 'user'
                  ? "bg-primary text-primary-foreground rounded-tr-md"
                  : m.status === 'error'
                    ? "bg-red-500/10 text-red-300 border border-red-500/20 rounded-tl-md"
                    : m.status === 'success' && m.command?.action !== 'chat'
                      ? "bg-green-500/10 text-green-300 border border-green-500/20 rounded-tl-md"
                      : "bg-secondary/50 text-foreground border border-border/30 rounded-tl-md"
              )}>
                {m.text}
              </div>
            </div>
          ))}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl rounded-tl-md bg-secondary/50 border border-border/30">
                <Loader2 size={14} className="animate-spin text-primary" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={messages.length === 0 ? "试说「记一下明天开会」或「帮我发个投票...」" : "继续对话或补充说明..."}
            disabled={isProcessing || isRecording}
            className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
          />
        </div>
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isProcessing}
          className={cn(
            "p-3 rounded-xl border transition-all shrink-0",
            isRecording
              ? "bg-red-500/10 border-red-500/30 text-red-400 ring-2 ring-red-500/20 animate-pulse"
              : "bg-background border-border/50 text-muted-foreground hover:text-primary hover:border-primary/20"
          )}
        >
          {isRecording ? <Square size={16} /> : <Mic size={16} />}
        </button>
        <Button
          onClick={() => handleSend()}
          disabled={!input.trim() || isProcessing}
          size="icon"
          className="rounded-xl h-[46px] w-[46px] shrink-0"
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  )
}

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then((d: any) => {
      setIsAuthenticated(d.authenticated === true)
    }).catch(() => setIsAuthenticated(false))
  }, [])

  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto h-full animate-in fade-in zoom-in-95 duration-500">
      {/* Hero Header */}
      <div className="relative pt-6 pb-2">
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight relative z-10">
          欢迎来到 <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50">Magic Ball</span>
        </h1>
        <p className="text-muted-foreground mt-3 text-lg md:text-xl font-medium relative z-10 max-w-xl">
          你个人的、高度可扩展的全能效率工具主控台。
        </p>
      </div>

      {/* AI Command Center */}
      {isAuthenticated && <AICommandCenter />}

      {/* Tool cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        <Link href="/tools/ideas" className="block outline-none border-none">
          <Card className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] cursor-pointer h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-col pb-2 relative z-10">
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-500">
                  <Zap className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </div>
              <CardTitle className="text-xl font-semibold mt-4">闪念笔记</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                极速无感知的多媒体随身便签。支持 #标签 提取、语音录制和图片上传，数据完全本地私有化。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/tools/polls" className="block outline-none border-none">
          <Card className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] cursor-pointer h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-col pb-2 relative z-10">
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-500">
                  <Vote className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </div>
              <CardTitle className="text-xl font-semibold mt-4">投票收集</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                创建单选、多选或意见征集投票，生成链接发给参与者即可匿名投票。支持访问码保护与防刷票机制。
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
