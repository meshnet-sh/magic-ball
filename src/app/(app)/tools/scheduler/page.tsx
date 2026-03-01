"use client"

import { useState, useEffect } from "react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import { Calendar, Plus, Trash2, Pause, Play, Clock, Zap, Brain, Bell, Loader2, Sparkles, Repeat } from "lucide-react"
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

const ACTION_LABELS: Record<string, { label: string; icon: any; color: string; ring: string }> = {
    create_idea: { label: "创建笔记", icon: Zap, color: "text-amber-600", ring: "ring-amber-500/20" },
    ai_agent: { label: "唤醒 AI", icon: Brain, color: "text-sky-600", ring: "ring-sky-500/20" },
    ai_prompt: { label: "唤醒 AI", icon: Brain, color: "text-sky-600", ring: "ring-sky-500/20" },
    reminder: { label: "提醒", icon: Bell, color: "text-emerald-600", ring: "ring-emerald-500/20" },
}

function getRecurrenceLabel(r: string): string {
    if (r.startsWith("minutes:")) return `每 ${r.split(":")[1]} 分钟`
    if (r.startsWith("hours:")) return `每 ${r.split(":")[1]} 小时`
    const labels: Record<string, string> = { daily: "每天", weekly: "每周", monthly: "每月" }
    return labels[r] || r
}

function parsePayload(payloadStr: string): any {
    try {
        return JSON.parse(payloadStr)
    } catch {
        return {}
    }
}

function getTaskContent(task: ScheduledTask): string {
    const payload = parsePayload(task.actionPayload)
    const effectiveAction = payload?.action || task.actionType

    if (effectiveAction === "reminder") return payload?.message || "(未填写提醒内容)"
    if (effectiveAction === "ai_agent" || effectiveAction === "ai_prompt") return payload?.prompt || "(未填写 AI 提示词)"
    if (effectiveAction === "create_idea") return payload?.content || "(未填写笔记内容)"

    if (typeof payload === "string") return payload
    if (payload && typeof payload === "object") return JSON.stringify(payload)
    return "(无执行内容)"
}

export default function SchedulerPage() {
    const [tasks, setTasks] = useState<ScheduledTask[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState<"active" | "all">("active")
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
            const url = filter === "active" ? "/api/scheduler?status=active" : "/api/scheduler"
            const res = await fetch(url)
            const data = await res.json()
            if (data.success) setTasks(data.data)
        } catch (err) {
            console.error("Failed to fetch tasks", err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTasks()
    }, [filter])

    const handleCreateTask = async () => {
        if (!title.trim() || !triggerTime) return
        setSubmitting(true)
        try {
            const triggerAt = new Date(triggerTime).getTime()
            let payload: any = {}
            if (actionType === "create_idea") payload = { action: "create_idea", content: actionContent, tags: [] }
            else if (actionType === "ai_agent") payload = { action: "ai_agent", prompt: actionContent }
            else payload = { action: "reminder", message: actionContent || title }

            const res = await fetch("/api/scheduler", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    triggerAt,
                    recurrence: recurrence || null,
                    actionType: payload.action,
                    actionPayload: payload,
                }),
            })
            if (res.ok) {
                setTitle("")
                setTriggerTime("")
                setRecurrence("")
                setActionContent("")
                setShowForm(false)
                fetchTasks()
            }
        } catch (err) {
            console.error(err)
        } finally {
            setSubmitting(false)
        }
    }

    const toggleStatus = async (task: ScheduledTask) => {
        const newStatus = task.status === "active" ? "paused" : "active"
        await fetch("/api/scheduler", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: task.id, status: newStatus }),
        })
        fetchTasks()
    }

    const deleteTask = async (id: string) => {
        await fetch(`/api/scheduler?id=${id}`, { method: "DELETE" })
        setDeletingId(null)
        fetchTasks()
    }

    const formatTriggerTime = (ts: number) => {
        const d = new Date(ts)
        const now = Date.now()
        const diff = ts - now
        if (diff < 0) return `已过期 (${d.toLocaleString("zh-CN")})`
        if (diff < 86400000) {
            return `${formatDistanceToNow(d, { locale: zhCN, addSuffix: true })} · ${d.toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
            })}`
        }
        return d.toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    }

    return (
        <div className="flex flex-col gap-6 max-w-5xl mx-auto animate-in fade-in duration-500">
            <section className="rounded-3xl border border-border/50 bg-gradient-to-br from-background via-background to-secondary/20 p-5 md:p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-2">
                            <Calendar className="text-primary" size={24} /> 日程调度
                        </h1>
                        <p className="text-sm text-muted-foreground mt-2">
                            让任务按计划自动执行。提醒、写笔记、唤醒 AI 都可以定时运行。
                        </p>
                    </div>
                    <Button onClick={() => setShowForm(!showForm)} className="rounded-2xl h-11 px-5">
                        <Plus size={16} className="mr-1" /> 新建任务
                    </Button>
                </div>
            </section>

            {showForm && (
                <section className="p-4 md:p-5 bg-secondary/25 backdrop-blur-xl border border-border/50 rounded-3xl space-y-4 animate-in slide-in-from-top-2 duration-200">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">任务标题</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="例如：每天 9 点项目晨报"
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">触发时间</label>
                            <input
                                type="datetime-local"
                                value={triggerTime}
                                onChange={(e) => setTriggerTime(e.target.value)}
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">重复频率</label>
                            <select
                                value={recurrence}
                                onChange={(e) => setRecurrence(e.target.value)}
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                <option value="">一次性</option>
                                <option value="minutes:5">每 5 分钟</option>
                                <option value="minutes:30">每 30 分钟</option>
                                <option value="hours:1">每小时</option>
                                <option value="daily">每天</option>
                                <option value="weekly">每周</option>
                                <option value="monthly">每月</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">执行类型</label>
                            <div className="flex gap-2">
                                {[
                                    ["reminder", "提醒"],
                                    ["ai_agent", "唤醒 AI"],
                                    ["create_idea", "创建笔记"],
                                ].map(([key, label]) => (
                                    <button
                                        key={key}
                                        onClick={() => setActionType(key)}
                                        className={cn(
                                            "px-3 py-2 rounded-xl border text-sm transition-all",
                                            actionType === key
                                                ? "bg-primary/10 border-primary/30 text-primary"
                                                : "border-border/50 text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">
                            {actionType === "create_idea"
                                ? "笔记内容"
                                : actionType === "ai_agent"
                                ? "AI 执行提示词（写清楚要做什么）"
                                : "提醒内容"}
                        </label>
                        <textarea
                            value={actionContent}
                            onChange={(e) => setActionContent(e.target.value)}
                            placeholder={
                                actionType === "ai_agent"
                                    ? "例如：总结今天新增的笔记，生成一条 120 字以内日报并记录为新笔记"
                                    : actionType === "create_idea"
                                    ? "例如：项目复盘要点：..."
                                    : "例如：提醒我给客户发周报"
                            }
                            rows={3}
                            className="w-full bg-background border border-border/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                        />
                    </div>

                    <div className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setShowForm(false)} className="rounded-xl">
                            取消
                        </Button>
                        <Button onClick={handleCreateTask} disabled={!title.trim() || !triggerTime || submitting} className="rounded-xl">
                            {submitting ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                            创建任务
                        </Button>
                    </div>
                </section>
            )}

            <div className="flex items-center gap-2">
                <button
                    onClick={() => setFilter("active")}
                    className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        filter === "active" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    活跃任务
                </button>
                <button
                    onClick={() => setFilter("all")}
                    className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                        filter === "all" ? "bg-primary/10 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    所有任务
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader2 className="animate-spin text-primary" size={24} />
                </div>
            ) : tasks.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border border-dashed border-border/60 rounded-3xl bg-secondary/20">
                    <Sparkles size={40} className="mx-auto mb-3 opacity-40" />
                    <p>还没有任务</p>
                    <p className="text-xs mt-1">可手动创建，或直接语音告诉 AI 来帮你创建。</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {tasks.map((task) => {
                        const payloadAction = parsePayload(task.actionPayload)?.action || task.actionType
                        const actionMeta = ACTION_LABELS[payloadAction] || {
                            label: payloadAction,
                            icon: Clock,
                            color: "text-muted-foreground",
                            ring: "ring-border/40",
                        }
                        const ActionIcon = actionMeta.icon
                        const content = getTaskContent(task)

                        const isPaused = task.status === "paused"
                        const isCompleted = task.status === "completed"
                        const isOverdue = task.triggerAt < Date.now() && task.status === "active"

                        return (
                            <div
                                key={task.id}
                                className={cn(
                                    "p-4 md:p-5 rounded-3xl border transition-all bg-background",
                                    isCompleted
                                        ? "border-border/40 opacity-65"
                                        : isPaused
                                        ? "border-yellow-500/30 bg-yellow-500/5"
                                        : isOverdue
                                        ? "border-red-500/30 bg-red-500/5"
                                        : "border-border/60 hover:border-primary/30"
                                )}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] ring-1", actionMeta.ring)}>
                                                <ActionIcon size={12} className={actionMeta.color} /> {actionMeta.label}
                                            </span>
                                            {task.recurrence && (
                                                <span className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] bg-primary/10 text-primary">
                                                    <Repeat size={11} /> {getRecurrenceLabel(task.recurrence)}
                                                </span>
                                            )}
                                            {isPaused && <span className="text-[10px] bg-yellow-500/15 text-yellow-600 px-2 py-1 rounded-full">已暂停</span>}
                                            {isCompleted && <span className="text-[10px] bg-green-500/15 text-green-600 px-2 py-1 rounded-full">已完成</span>}
                                            {isOverdue && <span className="text-[10px] bg-red-500/15 text-red-600 px-2 py-1 rounded-full">待触发</span>}
                                        </div>

                                        <h3 className="mt-2 text-base font-semibold leading-snug">{task.title}</h3>

                                        <div className="mt-2 text-xs text-muted-foreground flex items-center gap-3">
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} /> {formatTriggerTime(task.triggerAt)}
                                            </span>
                                            {task.lastTriggered ? (
                                                <span>上次执行：{new Date(task.lastTriggered).toLocaleString("zh-CN")}</span>
                                            ) : null}
                                        </div>

                                        <div className="mt-3 rounded-xl bg-secondary/35 border border-border/40 px-3 py-2">
                                            <p className="text-[11px] text-muted-foreground mb-1">执行内容</p>
                                            <p className="text-sm whitespace-pre-wrap break-words">{content}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-1 shrink-0">
                                        {!isCompleted && (
                                            <button
                                                onClick={() => toggleStatus(task)}
                                                className="p-2 rounded-lg hover:bg-secondary/70 text-muted-foreground hover:text-foreground"
                                                title={isPaused ? "恢复" : "暂停"}
                                            >
                                                {isPaused ? <Play size={15} /> : <Pause size={15} />}
                                            </button>
                                        )}
                                        {deletingId === task.id ? (
                                            <div className="flex gap-2 text-xs items-center">
                                                <span className="text-destructive font-medium">确认删除?</span>
                                                <button onClick={() => deleteTask(task.id)} className="text-destructive hover:underline">
                                                    是
                                                </button>
                                                <button onClick={() => setDeletingId(null)} className="text-muted-foreground hover:underline">
                                                    否
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setDeletingId(task.id)}
                                                className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500"
                                                title="删除"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                        )}
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
