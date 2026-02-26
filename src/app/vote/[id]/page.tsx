"use client"

import { useState, useEffect, use } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { CheckCircle2, Lock, AlertCircle, Send } from "lucide-react"

interface PollData {
    id: string
    title: string
    description: string | null
    type: "single_choice" | "multi_choice" | "open_text"
    hasAccessCode: boolean
    options: { id: string; content: string }[]
}

// Simple browser fingerprint
function getFingerprint(): string {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    const screen = typeof window !== 'undefined' ? window.screen : null
    const raw = [
        nav?.userAgent || '',
        nav?.language || '',
        screen?.width || '',
        screen?.height || '',
        screen?.colorDepth || '',
        Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    ].join('|')

    // Simple hash
    let hash = 0
    for (let i = 0; i < raw.length; i++) {
        const chr = raw.charCodeAt(i)
        hash = ((hash << 5) - hash) + chr
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

export default function VotePage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params)
    const [poll, setPoll] = useState<PollData | null>(null)
    const [needsCode, setNeedsCode] = useState(false)
    const [accessCode, setAccessCode] = useState("")
    const [error, setError] = useState("")
    const [submitted, setSubmitted] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    // Vote state
    const [selectedOption, setSelectedOption] = useState<string | null>(null)
    const [selectedOptions, setSelectedOptions] = useState<string[]>([])
    const [textContent, setTextContent] = useState("")

    const fetchPoll = async (code?: string) => {
        setError("")
        const url = code ? `/api/polls/${id}?code=${encodeURIComponent(code)}` : `/api/polls/${id}`
        const res = await fetch(url)
        const data = await res.json()

        if (data.success) {
            setPoll(data.data)
            setNeedsCode(false)
        } else if (data.needsCode) {
            setNeedsCode(true)
        } else {
            setError(data.error || "加载失败")
        }
    }

    useEffect(() => { fetchPoll() }, [id])

    const submitVote = async () => {
        setIsSubmitting(true)
        setError("")
        try {
            const body: any = { fingerprint: getFingerprint() }
            if (poll!.hasAccessCode) body.accessCode = accessCode

            if (poll!.type === "single_choice") {
                if (!selectedOption) { setError("请选择一个选项"); setIsSubmitting(false); return }
                body.optionId = selectedOption
            } else if (poll!.type === "multi_choice") {
                if (selectedOptions.length === 0) { setError("请至少选择一个选项"); setIsSubmitting(false); return }
                body.optionIds = selectedOptions
            } else {
                if (!textContent.trim()) { setError("请输入您的意见"); setIsSubmitting(false); return }
                body.textContent = textContent.trim()
            }

            const res = await fetch(`/api/polls/${id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            })
            const data = await res.json()

            if (data.success) {
                setSubmitted(true)
            } else {
                setError(data.error || "提交失败")
            }
        } finally { setIsSubmitting(false) }
    }

    const toggleMultiOption = (optId: string) => {
        setSelectedOptions(prev =>
            prev.includes(optId) ? prev.filter(id => id !== optId) : [...prev, optId]
        )
    }

    // ===== Render states =====

    // Loading
    if (!poll && !needsCode && !error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-background">
                <div className="animate-pulse text-muted-foreground">加载中...</div>
            </div>
        )
    }

    // Error
    if (error && !poll && !needsCode) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <AlertCircle size={48} className="text-destructive mb-4" />
                <p className="text-destructive text-center">{error}</p>
            </div>
        )
    }

    // Access code gate
    if (needsCode) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <div className="w-full max-w-sm p-8 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl flex flex-col items-center gap-5">
                    <div className="p-4 bg-primary/10 rounded-2xl text-primary ring-1 ring-primary/20">
                        <Lock size={32} />
                    </div>
                    <h1 className="text-xl font-bold">需要访问码</h1>
                    <p className="text-sm text-muted-foreground text-center">此投票需要输入访问码才能参与</p>
                    <input
                        value={accessCode}
                        onChange={e => setAccessCode(e.target.value)}
                        placeholder="请输入访问码"
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 text-center tracking-widest"
                        onKeyDown={e => e.key === 'Enter' && fetchPoll(accessCode)}
                    />
                    {error && <p className="text-xs text-destructive">{error}</p>}
                    <Button onClick={() => fetchPoll(accessCode)} className="w-full rounded-xl py-5">
                        验证并进入
                    </Button>
                </div>
            </div>
        )
    }

    // Thank you page (after submit)
    if (submitted) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
                <div className="w-full max-w-sm p-8 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl flex flex-col items-center gap-4 animate-in fade-in zoom-in-95">
                    <div className="p-4 bg-green-500/10 rounded-2xl text-green-400 ring-1 ring-green-500/20">
                        <CheckCircle2 size={40} />
                    </div>
                    <h1 className="text-xl font-bold">感谢您的参与！</h1>
                    <p className="text-sm text-muted-foreground text-center">您的回复已成功提交。</p>
                </div>
            </div>
        )
    }

    // Voting form
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
            <div className="w-full max-w-md p-6 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl flex flex-col gap-5 animate-in fade-in zoom-in-95">
                <div className="text-center space-y-1">
                    <h1 className="text-xl font-bold">{poll!.title}</h1>
                    {poll!.description && <p className="text-sm text-muted-foreground">{poll!.description}</p>}
                </div>

                {/* Single choice */}
                {poll!.type === "single_choice" && (
                    <div className="space-y-2">
                        {poll!.options.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => setSelectedOption(opt.id)}
                                className={cn(
                                    "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
                                    selectedOption === opt.id
                                        ? "bg-primary/10 border-primary/30 text-primary ring-1 ring-primary/20"
                                        : "bg-background border-border/50 hover:border-primary/20 text-foreground"
                                )}
                            >
                                <span className={cn("inline-block w-4 h-4 rounded-full border-2 mr-3 align-middle transition-all", selectedOption === opt.id ? "border-primary bg-primary" : "border-muted-foreground")} />
                                {opt.content}
                            </button>
                        ))}
                    </div>
                )}

                {/* Multi choice */}
                {poll!.type === "multi_choice" && (
                    <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">可选择多项</p>
                        {poll!.options.map(opt => {
                            const checked = selectedOptions.includes(opt.id)
                            return (
                                <button
                                    key={opt.id}
                                    onClick={() => toggleMultiOption(opt.id)}
                                    className={cn(
                                        "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
                                        checked
                                            ? "bg-primary/10 border-primary/30 text-primary ring-1 ring-primary/20"
                                            : "bg-background border-border/50 hover:border-primary/20 text-foreground"
                                    )}
                                >
                                    <span className={cn("inline-block w-4 h-4 rounded mr-3 align-middle border-2 transition-all", checked ? "border-primary bg-primary" : "border-muted-foreground")} />
                                    {opt.content}
                                </button>
                            )
                        })}
                    </div>
                )}

                {/* Open text */}
                {poll!.type === "open_text" && (
                    <textarea
                        value={textContent}
                        onChange={e => setTextContent(e.target.value)}
                        placeholder="请输入您的意见或建议..."
                        rows={4}
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                )}

                {error && <p className="text-xs text-destructive text-center">{error}</p>}

                <Button onClick={submitVote} disabled={isSubmitting} className="w-full rounded-xl py-5 gap-2">
                    <Send size={16} />
                    {isSubmitting ? "提交中..." : "提交"}
                </Button>

                <p className="text-[10px] text-muted-foreground text-center">您的回复完全匿名</p>
            </div>
        </div>
    )
}
