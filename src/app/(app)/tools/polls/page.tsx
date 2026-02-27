"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import {
    Plus, Trash2, Copy, Check, ChevronDown, ChevronUp,
    ToggleLeft, ToggleRight, ClipboardList, MessageSquareText,
    ListChecks, X
} from "lucide-react"

type PollType = "single_choice" | "multi_choice" | "open_text"

interface Poll {
    id: string
    title: string
    description: string | null
    type: PollType
    accessCode: string | null
    isActive: boolean
    createdAt: number
    options: { id: string; content: string }[]
    responseCount: number
}

interface PollResult {
    poll: Poll
    totalResponses: number
    options?: { id: string; content: string; votes: number }[]
    textResponses?: { content: string; createdAt: number }[]
}

const TYPE_LABELS: Record<PollType, string> = {
    single_choice: "单选",
    multi_choice: "多选",
    open_text: "文本征集"
}

const TYPE_ICONS: Record<PollType, any> = {
    single_choice: ClipboardList,
    multi_choice: ListChecks,
    open_text: MessageSquareText
}

export default function PollsPage() {
    const [polls, setPolls] = useState<Poll[]>([])
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [showCreate, setShowCreate] = useState(false)
    const [expandedPoll, setExpandedPoll] = useState<string | null>(null)
    const [pollResults, setPollResults] = useState<Record<string, PollResult>>({})
    const [copiedId, setCopiedId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)
    const router = useRouter()

    // Create form state
    const [title, setTitle] = useState("")
    const [description, setDescription] = useState("")
    const [pollType, setPollType] = useState<PollType>("single_choice")
    const [accessCode, setAccessCode] = useState("")
    const [options, setOptions] = useState(["", ""])
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch("/api/auth")
                const data: any = await res.json()
                if (res.ok && data.authenticated) {
                    setIsAuthenticated(true)
                    fetchPolls()
                } else {
                    router.replace("/login")
                }
            } catch { router.replace("/login") }
        }
        init()
    }, [])

    const fetchPolls = async () => {
        const res = await fetch("/api/polls")
        const data = await res.json()
        if (data.success) setPolls(data.data)
    }

    const createPoll = async () => {
        if (!title.trim()) return
        setIsSubmitting(true)
        try {
            const body: any = { title: title.trim(), description: description.trim() || null, type: pollType, accessCode: accessCode.trim() || null }
            if (pollType !== "open_text") {
                body.options = options.filter(o => o.trim())
                if (body.options.length < 2) { alert("至少需要两个选项"); setIsSubmitting(false); return }
            }
            const res = await fetch("/api/polls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
            if (res.ok) {
                setTitle(""); setDescription(""); setAccessCode(""); setOptions(["", ""]); setShowCreate(false)
                fetchPolls()
            }
        } finally { setIsSubmitting(false) }
    }

    const deletePoll = async (id: string) => {
        const res = await fetch(`/api/polls?id=${id}`, { method: "DELETE" })
        if (!res.ok) {
            const err = await res.json().catch(() => ({}))
            alert(`删除失败: ${err.error || res.statusText}`)
        } else {
            fetchPolls()
        }
        setDeletingId(null)
    }

    const togglePoll = async (id: string) => {
        const res = await fetch("/api/polls", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
        if (res.ok) {
            fetchPolls()
        } else {
            const err = await res.json().catch(() => ({}))
            alert(`操作失败: ${err.error || res.statusText}`)
        }
    }

    const viewResults = async (id: string) => {
        if (expandedPoll === id) { setExpandedPoll(null); return }
        const res = await fetch(`/api/polls/${id}/results`)
        const data = await res.json()
        if (data.success) {
            setPollResults(prev => ({ ...prev, [id]: data.data }))
            setExpandedPoll(id)
        }
    }

    const copyLink = (id: string) => {
        const url = `${window.location.origin}/vote/${id}`
        navigator.clipboard.writeText(url)
        setCopiedId(id)
        setTimeout(() => setCopiedId(null), 2000)
    }

    if (!isAuthenticated) return null

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
                <h1 className="text-lg font-bold tracking-tight">投票收集</h1>
                <Button size="sm" onClick={() => setShowCreate(!showCreate)} className="gap-1.5">
                    {showCreate ? <X size={16} /> : <Plus size={16} />}
                    {showCreate ? "取消" : "新建投票"}
                </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Create form */}
                {showCreate && (
                    <div className="p-4 rounded-2xl bg-secondary/30 border border-primary/20 space-y-3 animate-in fade-in slide-in-from-top-2">
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="投票标题 *" className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
                        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="补充描述（可选）" rows={2} className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 resize-none" />

                        {/* Type selector */}
                        <div className="flex gap-2">
                            {(["single_choice", "multi_choice", "open_text"] as PollType[]).map(t => {
                                const Icon = TYPE_ICONS[t]
                                return (
                                    <button key={t} onClick={() => setPollType(t)} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-all", pollType === t ? "bg-primary/10 text-primary border-primary/30" : "bg-background border-border/50 text-muted-foreground hover:text-foreground")}>
                                        <Icon size={14} /> {TYPE_LABELS[t]}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Options (for choice types) */}
                        {pollType !== "open_text" && (
                            <div className="space-y-2">
                                <p className="text-xs text-muted-foreground">选项</p>
                                {options.map((opt, i) => (
                                    <div key={i} className="flex gap-2">
                                        <input value={opt} onChange={e => { const newOpts = [...options]; newOpts[i] = e.target.value; setOptions(newOpts) }} placeholder={`选项 ${i + 1}`} className="flex-1 bg-background border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/50" />
                                        {options.length > 2 && (
                                            <button onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive p-1"><X size={14} /></button>
                                        )}
                                    </div>
                                ))}
                                <button onClick={() => setOptions([...options, ""])} className="text-xs text-primary hover:underline">+ 添加选项</button>
                            </div>
                        )}

                        {/* Access code */}
                        <input value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="访问码（留空则公开投票）" className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50" />

                        <Button onClick={createPoll} disabled={isSubmitting} className="w-full rounded-xl">
                            {isSubmitting ? "创建中..." : "创建投票"}
                        </Button>
                    </div>
                )}

                {/* Poll list */}
                {polls.length === 0 && !showCreate && (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                        <ClipboardList size={48} className="mb-4 opacity-30" />
                        <p className="text-sm">还没有创建任何投票</p>
                        <p className="text-xs mt-1">点击右上角"新建投票"开始</p>
                    </div>
                )}

                {polls.map(poll => {
                    const Icon = TYPE_ICONS[poll.type]
                    const result = pollResults[poll.id]
                    const isExpanded = expandedPoll === poll.id
                    return (
                        <div key={poll.id} className="rounded-2xl bg-secondary/30 border border-border/50 overflow-hidden transition-all">
                            <div className="p-4 space-y-2">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2">
                                        <Icon size={16} className="text-primary shrink-0" />
                                        <h3 className="font-semibold text-sm">{poll.title}</h3>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", poll.isActive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>
                                            {poll.isActive ? "进行中" : "已关闭"}
                                        </span>
                                    </div>
                                </div>

                                {poll.description && <p className="text-xs text-muted-foreground">{poll.description}</p>}

                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span>{TYPE_LABELS[poll.type]}</span>
                                    <span>·</span>
                                    <span>{poll.responseCount} 人参与</span>
                                    <span>·</span>
                                    <span>{formatDistanceToNow(poll.createdAt, { addSuffix: true, locale: zhCN })}</span>
                                    {poll.accessCode && <><span>·</span><span>🔒 有访问码</span></>}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-2 pt-1">
                                    <button onClick={() => viewResults(poll.id)} className="flex items-center gap-1 text-xs text-primary hover:underline">
                                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        {isExpanded ? "收起结果" : "查看结果"}
                                    </button>
                                    <button onClick={() => copyLink(poll.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                        {copiedId === poll.id ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                        {copiedId === poll.id ? "已复制" : "复制链接"}
                                    </button>
                                    <button onClick={() => togglePoll(poll.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                        {poll.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                        {poll.isActive ? "关闭" : "开启"}
                                    </button>
                                    {deletingId === poll.id ? (
                                        <div className="flex gap-2 text-xs ml-auto items-center">
                                            <span className="text-destructive font-medium">确认永久删除?</span>
                                            <button onClick={() => deletePoll(poll.id)} className="text-destructive hover:underline">是</button>
                                            <button onClick={() => setDeletingId(null)} className="text-muted-foreground hover:underline">否</button>
                                        </div>
                                    ) : (
                                        <button onClick={() => setDeletingId(poll.id)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive ml-auto">
                                            <Trash2 size={14} /> 删除
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Results panel */}
                            {isExpanded && result && (
                                <div className="border-t border-border/30 p-4 bg-background/50 animate-in fade-in slide-in-from-top-1">
                                    <p className="text-xs text-muted-foreground mb-3">共 {result.totalResponses} 人参与</p>
                                    {result.options ? (
                                        <div className="space-y-2">
                                            {result.options.map(opt => {
                                                const pct = result.totalResponses > 0 ? Math.round((opt.votes / result.totalResponses) * 100) : 0
                                                return (
                                                    <div key={opt.id} className="space-y-1">
                                                        <div className="flex justify-between text-xs"><span>{opt.content}</span><span className="text-primary font-medium">{opt.votes} 票 ({pct}%)</span></div>
                                                        <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-primary/60 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ) : result.textResponses ? (
                                        <div className="space-y-2 max-h-60 overflow-y-auto">
                                            {result.textResponses.length === 0 && <p className="text-xs text-muted-foreground">暂无意见</p>}
                                            {result.textResponses.map((r, i) => (
                                                <div key={i} className="p-3 bg-secondary/30 rounded-xl text-sm">
                                                    <p>{r.content}</p>
                                                    <p className="text-[10px] text-muted-foreground mt-1">{formatDistanceToNow(r.createdAt, { addSuffix: true, locale: zhCN })}</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
