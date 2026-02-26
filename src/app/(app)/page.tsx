"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Vote, Zap, ArrowRight, Sparkles, Mic, Send, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

function AICommandInput() {
  const [input, setInput] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'chat' | 'error', message: string } | null>(null)
  const recognitionRef = useRef<any>(null)
  const router = useRouter()

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setIsListening(false)
  }

  const startListening = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResult({ type: 'error', message: '您的浏览器不支持语音识别' })
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'zh-CN'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript
      setInput(transcript)
      setIsListening(false)
      // Auto-submit after voice input
      handleCommand(transcript)
    }

    recognition.onerror = () => {
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    setResult(null)
  }

  const handleCommand = async (text?: string) => {
    const message = text || input
    if (!message.trim() || isProcessing) return

    setIsProcessing(true)
    setResult(null)

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      })
      const data = await res.json()

      if (!data.success) {
        setResult({ type: 'error', message: data.error || '请求失败' })
        return
      }

      const cmd = data.command
      await executeCommand(cmd)
    } catch (err: any) {
      setResult({ type: 'error', message: '网络错误: ' + err.message })
    } finally {
      setIsProcessing(false)
    }
  }

  const executeCommand = async (cmd: any) => {
    switch (cmd.action) {
      case 'create_idea': {
        const tags = cmd.tags || []
        const content = tags.length > 0
          ? cmd.content + ' ' + tags.map((t: string) => `#${t}`).join(' ')
          : cmd.content

        const res = await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: crypto.randomUUID(),
            type: "text",
            content,
            tags: JSON.stringify(tags),
            createdAt: Date.now()
          })
        })
        if (res.ok) {
          setResult({ type: 'success', message: `✅ 已记录闪念: "${cmd.content}"` })
          setInput("")
        } else {
          setResult({ type: 'error', message: '记录失败，请检查网络' })
        }
        break
      }

      case 'create_poll': {
        const res = await fetch("/api/polls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: cmd.title,
            type: cmd.type,
            options: cmd.options || [],
            accessCode: cmd.accessCode || null
          })
        })
        if (res.ok) {
          const data = await res.json()
          setResult({ type: 'success', message: `✅ 已创建投票: "${cmd.title}"` })
          setInput("")
        } else {
          setResult({ type: 'error', message: '创建投票失败' })
        }
        break
      }

      case 'navigate': {
        setResult({ type: 'success', message: `🚀 正在跳转...` })
        setTimeout(() => router.push(cmd.path), 500)
        break
      }

      case 'chat':
      default: {
        setResult({ type: 'chat', message: cmd.message || '我不确定该怎么做，请再试试。' })
        break
      }
    }
  }

  return (
    <div className="relative">
      <div className="p-5 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-xl space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 bg-primary/10 rounded-lg">
            <Sparkles size={16} className="text-primary" />
          </div>
          <span className="text-sm font-semibold">AI 指令中心</span>
          <span className="text-[10px] text-muted-foreground ml-auto">语音 / 文字皆可</span>
        </div>

        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCommand()}
              placeholder="试试说「记录一下：明天下午3点开会」或「帮我发个投票...」"
              disabled={isProcessing || isListening}
              className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 pr-10 disabled:opacity-50"
            />
            {isProcessing && (
              <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-primary animate-spin" />
            )}
          </div>

          {/* Voice button */}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={isProcessing}
            className={cn(
              "p-3 rounded-xl border transition-all shrink-0",
              isListening
                ? "bg-red-500/10 border-red-500/30 text-red-400 ring-2 ring-red-500/20 animate-pulse"
                : "bg-background border-border/50 text-muted-foreground hover:text-primary hover:border-primary/20"
            )}
          >
            {isListening ? <Square size={16} /> : <Mic size={16} />}
          </button>

          {/* Send button */}
          <Button
            onClick={() => handleCommand()}
            disabled={!input.trim() || isProcessing}
            size="icon"
            className="rounded-xl h-[46px] w-[46px] shrink-0"
          >
            <Send size={16} />
          </Button>
        </div>

        {/* Result display */}
        {result && (
          <div className={cn(
            "p-3 rounded-xl text-sm animate-in fade-in slide-in-from-bottom-1",
            result.type === 'success' ? "bg-green-500/10 text-green-300 border border-green-500/20" :
              result.type === 'error' ? "bg-red-500/10 text-red-300 border border-red-500/20" :
                "bg-primary/5 text-foreground border border-primary/10"
          )}>
            {result.message}
          </div>
        )}
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
      {isAuthenticated && <AICommandInput />}

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
