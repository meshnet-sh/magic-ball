"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import { Calendar, Plus, Trash2, Pause, Play, Clock, Zap, Brain, Bell, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface ScheduledTask {
    id: string
    title: string
    triggerAt: number
    recurrence: string | null
    actionType: string
    actionPayload: string
    status: string
    lastTriggered: number | null
    createdAt: number
}

const ACTION_LABELS: Record<string, { label: string; icon: any; color: string }> = {
    create_idea: { label: "创建笔记", icon: Zap, color: "text-yellow-400" },
    ai_prompt: { label: "触发 AI", icon: Brain, color: "text-purple-400" },
    reminder: { label: "提醒", icon: Bell, color: "text-blue-400" },
}

function getRecurrenceLabel(r: string): string {
    if (r.startsWith('minutes:')) return `每 ${r.split(':')[1]} 分钟`
    if (r.startsWith('hours:')) return `每 ${r.split(':')[1]} 小时`
    const labels: Record<string, string> = { daily: '每天', weekly: '每周', monthly: '每月' }
    return labels[r] || r
}

export default function SchedulerPage() {
    const router = useRouter()
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<'active' | 'all'>('active')
    const [deletingId, setDeletingId] = useState<string | null>(null)

    // New task form
    const [showForm, setShowForm] = useState(false)
    const [title, setTitle] = useState("")
    const [triggerTime, setTriggerTime] = useState("")
    const [recurrence, setRecurrence] = useState<string>("")
    const [actionType, setActionType] = useState("reminder")
    const [actionContent, setActionContent] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const fetchTasks = async () => {
        try {
            const url = filter === 'active' ? '/api/scheduler?status=active' : '/api/scheduler'
            const res = await fetch(url)
            const data = await res.json()
            if (data.success) setTasks(data.data)
        } catch (err) {
            console.error("Failed to fetch tasks", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchTasks() }, [filter])

    const handleCreateTask = async () => {
        if (!title.trim() || !triggerTime) return
        setSubmitting(true)
        try {
            const triggerAt = new Date(triggerTime).getTime()
            let payload: any = {}
            if (actionType === 'create_idea') payload = { content: actionContent, tags: [] }
            else if (actionType === 'ai_prompt') payload = { prompt: actionContent }
            else if (actionType === 'reminder') payload = { message: actionContent || title }

            const res = await fetch('/api/scheduler', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title,
                    triggerAt,
                    recurrence: recurrence || null,
                    actionType,
                    actionPayload: payload,
                })
            })
            if (res.ok) {
                setTitle(""); setTriggerTime(""); setRecurrence(""); setActionContent(""); setShowForm(false)
                fetchTasks()
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    const toggleStatus = async (task: ScheduledTask) => {
        const newStatus = task.status === 'active' ? 'paused' : 'active'
        await fetch('/api/scheduler', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: newStatus })
        })
        fetchTasks()
    }

    const deleteTask = async (id: string) => {
        await fetch(`/api/scheduler?id=${id}`, { method: 'DELETE' })
        setDeletingId(null)
        fetchTasks()
    }

    const formatTriggerTime = (ts: number) => {
        const d = new Date(ts)
        const now = Date.now()
        const diff = ts - now
        if (diff < 0) return `已过期 (${d.toLocaleString('zh-CN')})`
        if (diff < 86400000) return `${formatDistanceToNow(d, { locale: zhCN, addSuffix: true })} · ${d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
        return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    return (
        <div className="flex flex-col gap-6 max-w-4xl mx-auto animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Calendar className="text-primary" size={24} /> 日程调度
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        创建定时任务，自动执行操作或触发 AI
                    </p>
                </div>
                <Button onClick={() => setShowForm(!showForm)} className="rounded-xl">
                    <Plus size={16} className="mr-1" /> 新建任务
                </Button>
            </div>

            {/* Create form */}
            {showForm && (
                <div className="p-4 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-2xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                    <input
                        value={title} onChange={e => setTitle(e.target.value)}
                        placeholder="任务名称（如：每日写日报提醒）"
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">触发时间</label>
                            <input type="datetime-local" value={triggerTime} onChange={e => setTriggerTime(e.target.value)}
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">重复</label>
                            <select value={recurrence} onChange={e => setRecurrence(e.target.value)}
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50">
                                <option value="">一次性</option>
                                <option value="minutes:1">每分钟</option>
                                <option value="minutes:5">每 5 分钟</option>
                                <option value="minutes:10">每 10 分钟</option>
                                <option value="minutes:30">每 30 分钟</option>
                                <option value="hours:1">每小时</option>
                                <option value="hours:2">每 2 小时</option>
                                <option value="daily">每天</option>
                                <option value="weekly">每周</option>
                                <option value="monthly">每月</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">操作类型</label>
                        <div className="flex gap-2">
                            {Object.entries(ACTION_LABELS).map(([key, { label, icon: Icon, color }]) => (
                                <button key={key} onClick={() => setActionType(key)}
                                    className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm transition-all",
                                        actionType === key ? "bg-primary/10 border-primary/30 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/20")}>
                                    <Icon size={14} className={color} /> {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <input
                        value={actionContent} onChange={e => setActionContent(e.target.value)}
                        placeholder={actionType === 'create_idea' ? "笔记内容" : actionType === 'ai_prompt' ? "AI 提示词" : "提醒内容"}
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setShowForm(false)} className="rounded-xl">取消</Button>
                        <Button onClick={handleCreateTask} disabled={!title.trim() || !triggerTime || submitting} className="rounded-xl">
                            {submitting ? <Loader2 size={14} className="animate-spin mr-1" /> : null} 创建
                        </Button>
                    </div>
                </div>
            )}

            {/* Filter */}
            <div className="flex gap-2">
                <button onClick={() => setFilter('active')}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", filter === 'active' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground")}>
                    活跃任务
                </button>
                <button onClick={() => setFilter('all')}
                    className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-all", filter === 'all' ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground")}>
                    所有任务
                </button>
            </div>

            {/* Task list */}
            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary" size={24} /></div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                    <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                    <p>还没有任务</p>
                    <p className="text-xs mt-1">点击上方「新建任务」或通过 AI 语音创建</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map(task => {
                        const actionMeta = ACTION_LABELS[task.actionType] || { label: task.actionType, icon: Clock, color: "text-muted-foreground" }
                        const ActionIcon = actionMeta.icon
                        const isPaused = task.status === 'paused'
                        const isCompleted = task.status === 'completed'
                        const isOverdue = task.triggerAt < Date.now() && task.status === 'active'

                        return (
                            <div key={task.id} className={cn(
                                "p-4 rounded-2xl border transition-all",
                                isCompleted ? "bg-secondary/20 border-border/30 opacity-60"
                                    : isPaused ? "bg-secondary/20 border-yellow-500/20"
                                        : isOverdue ? "bg-red-500/5 border-red-500/20"
                                            : "bg-secondary/30 border-border/50 hover:border-primary/30"
                            )}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <ActionIcon size={14} className={actionMeta.color} />
                                            <span className="font-semibold text-sm">{task.title}</span>
                                            {isPaused && <span className="text-[10px] bg-yellow-500/10 text-yellow-400 px-1.5 py-0.5 rounded-full">已暂停</span>}
                                            {isCompleted && <span className="text-[10px] bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full">已完成</span>}
                                            {isOverdue && <span className="text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full">待触发</span>}
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Clock size={11} /> {formatTriggerTime(task.triggerAt)}</span>
                                            {task.recurrence && <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{getRecurrenceLabel(task.recurrence)}</span>}
                                            <span className="text-[10px]">{actionMeta.label}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        {!isCompleted && (
                                            <button onClick={() => toggleStatus(task)} className="p-1.5 rounded-lg hover:bg-secondary/50 text-muted-foreground hover:text-foreground" title={isPaused ? '恢复' : '暂停'}>
                                                {isPaused ? <Play size={14} /> : <Pause size={14} />}
                                            </button>
                                        )}
                                        <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400" title="删除">
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
