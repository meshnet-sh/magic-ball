"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import {
    Settings, ShieldAlert, Brain, Eye, EyeOff, Save, Check,
    Zap, Vote, Users, ChevronDown, ChevronUp, Globe, Link2
} from "lucide-react"
import { Button } from "@/components/ui/button"

type Tab = "admin" | "ai" | "integrations"

const GEMINI_MODELS = [
    { value: "gemini-pro-latest", label: "Pro · 最前沿", desc: "始终指向最强推理能力模型" },
    { value: "gemini-flash-latest", label: "Flash · 主力", desc: "平衡速度与性能，日常高频首选" },
    { value: "gemini-flash-lite-latest", label: "Flash Lite · 极速", desc: "极致低延迟、低成本轻量模型" },
]

export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("ai")
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const router = useRouter()

    // AI Settings state
    const [geminiKey, setGeminiKey] = useState("")
    const [geminiModel, setGeminiModel] = useState("gemini-flash-latest")
    const [feishuOpenId, setFeishuOpenId] = useState("")
    const [showKey, setShowKey] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [isAdmin, setIsAdmin] = useState(false)

    // Integrations State
    const [n8nUrl, setN8nUrl] = useState("")
    const [n8nToken, setN8nToken] = useState("")

    // Admin state
    const [adminData, setAdminData] = useState<any>(null)
    const [adminError, setAdminError] = useState("")
    const [adminLoading, setAdminLoading] = useState(false)
    const [expandedSection, setExpandedSection] = useState<string | null>("ideas")

    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch("/api/auth")
                const data: any = await res.json()
                if (res.ok && data.authenticated) {
                    setIsAuthenticated(true)
                    loadSettings()
                } else { router.replace("/login") }
            } catch { router.replace("/login") }
        }
        init()
    }, [])

    const loadSettings = async () => {
        try {
            const res = await fetch("/api/settings")
            const data = await res.json()
            if (data.success && data.data) {
                setIsAdmin(data.isAdmin || false)
                if (data.data.gemini_api_key) setGeminiKey(data.data.gemini_api_key)
                if (data.data.gemini_model) setGeminiModel(data.data.gemini_model)
                if (data.data.feishu_open_id) setFeishuOpenId(data.data.feishu_open_id)
                if (data.data.integrations) {
                    try {
                        const parsed = JSON.parse(data.data.integrations)
                        if (parsed.n8n) {
                            setN8nUrl(parsed.n8n.url || "")
                            setN8nToken(parsed.n8n.token || "")
                        }
                    } catch (e) { console.error("Failed to parse integrations", e) }
                }
            }
        } catch { }
    }

    const saveSetting = async (key: string, value: string) => {
        await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) })
    }

    const saveAllSettings = async () => {
        setIsSaving(true)
        try {
            if (isAdmin) {
                await saveSetting("gemini_api_key", geminiKey)
                await saveSetting("gemini_model", geminiModel)
            }
            // Integrations are now per-user
            await saveSetting("integrations", JSON.stringify({
                n8n: { url: n8nUrl, token: n8nToken }
            }))

            await saveSetting("feishu_open_id", feishuOpenId)
            setSaved(true)
            setTimeout(() => setSaved(false), 2000)
        } finally { setIsSaving(false) }
    }

    const loadAdminData = async () => {
        if (adminData) return // already loaded
        setAdminLoading(true)
        try {
            const res = await fetch("/api/admin")
            const data = await res.json()
            if (data.success) { setAdminData(data.data) }
            else { setAdminError(data.error || "无权限") }
        } catch { setAdminError("加载失败") }
        finally { setAdminLoading(false) }
    }

    useEffect(() => {
        if (activeTab === "admin") loadAdminData()
    }, [activeTab])

    if (!isAuthenticated) return null

    return (
        <div className="flex flex-col h-full max-w-4xl mx-auto w-full">
            {/* Header */}
            <div className="flex items-center gap-3 px-1 py-3 border-b border-border/50">
                <Settings size={20} className="text-primary" />
                <h1 className="text-lg font-bold tracking-tight">设置</h1>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border/50 mt-2">
                <button onClick={() => setActiveTab("ai")} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2", activeTab === "ai" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    <Brain size={16} /> 个性化与 AI 参数
                </button>
                {isAdmin && (
                    <button onClick={() => setActiveTab("admin")} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2", activeTab === "admin" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                        <ShieldAlert size={16} /> 后台管理 (Admin)
                    </button>
                )}
                <button onClick={() => setActiveTab("integrations")} className={cn("flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all border-b-2", activeTab === "integrations" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    <Globe size={16} /> 外部集成
                </button>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
                {/* ===== AI CONFIG TAB ===== */}
                {activeTab === "ai" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 max-w-lg">
                        <div>
                            <h2 className="text-base font-semibold mb-1">系统与 AI 配置</h2>
                            <p className="text-xs text-muted-foreground">设置飞书联通属性。{isAdmin ? "管理员可配置全局模型推理偏好。" : "系统由管理员统一提供算力池。"}</p>
                        </div>

                        {/* API Key (Admin Only) */}
                        {isAdmin && (
                            <div className="space-y-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
                                <label className="text-sm font-medium flex items-center gap-2 text-primary">
                                    <ShieldAlert size={14} /> 全局 API Key (仅管理员可见)
                                </label>
                                <div className="relative">
                                    <input
                                        type={showKey ? "text" : "password"}
                                        value={geminiKey}
                                        onChange={e => setGeminiKey(e.target.value)}
                                        placeholder="AIzaSy..."
                                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 pr-12 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                                        {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                    此 Key 将作为全局算力池，供所有注册用户在后台消耗。
                                </p>
                            </div>
                        )}

                        {/* Feishu Bind */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium">绑定飞书端机器人</label>
                            <input
                                type="text"
                                value={feishuOpenId}
                                onChange={e => setFeishuOpenId(e.target.value)}
                                placeholder="ou_xyz1234..."
                                className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/50"
                            />
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                在飞书对机器人说话获取 <b>Open ID</b> 后，填写至此框进行双端联通。<br />
                                联通后，飞书指令将直接同步至当前账号。
                            </p>
                        </div>

                        {/* Model selector */}
                        {isAdmin && (
                            <div className="space-y-2">
                                <label className="text-sm font-medium">模型选择 (全局算力模型)</label>
                                <div className="grid grid-cols-1 gap-2">
                                    {GEMINI_MODELS.map(m => (
                                        <button key={m.value} onClick={() => setGeminiModel(m.value)} className={cn("text-left px-4 py-3 rounded-xl border text-sm transition-all", geminiModel === m.value ? "bg-primary/10 border-primary/30 text-primary ring-1 ring-primary/20" : "bg-background border-border/50 hover:border-primary/20")}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-semibold">{m.label}</span>
                                                <span className="text-[10px] text-muted-foreground font-mono">{m.value}</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">{m.desc}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Save button */}
                        <Button onClick={saveAllSettings} disabled={isSaving} className="w-full rounded-xl py-5 gap-2">
                            {saved ? <><Check size={16} /> 已保存</> : <><Save size={16} /> {isSaving ? "保存中..." : "保存配置"}</>}
                        </Button>
                    </div>
                )}

                {/* ===== INTEGRATIONS TAB ===== */}
                {activeTab === "integrations" && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 max-w-lg">
                        <div>
                            <h2 className="text-base font-semibold mb-1">系统集成配置</h2>
                            <p className="text-xs text-muted-foreground">配置外部 Webhook、API 等系统的接入参数。</p>
                        </div>

                        {/* n8n */}
                        <div className="space-y-4 p-4 rounded-xl border border-border/50 bg-secondary/10">
                            <div className="flex items-center gap-2 font-semibold">
                                <Link2 size={18} className="text-primary" /> n8n 自动化平台
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Webhook URL</label>
                                <input
                                    type="text"
                                    value={n8nUrl}
                                    onChange={e => setN8nUrl(e.target.value)}
                                    placeholder="https://n8n.yourserver.com/webhook/..."
                                    className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/50"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Auth Token (可选)</label>
                                <input
                                    type="password"
                                    value={n8nToken}
                                    onChange={e => setN8nToken(e.target.value)}
                                    placeholder="用于 n8n 侧鉴权"
                                    className="w-full bg-background border border-border/50 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-primary/50"
                                />
                            </div>
                        </div>

                        {/* Save button */}
                        <Button onClick={saveAllSettings} disabled={isSaving} className="w-full rounded-xl py-5 gap-2">
                            {saved ? <><Check size={16} /> 已保存</> : <><Save size={16} /> {isSaving ? "保存中..." : "保存配置"}</>}
                        </Button>
                    </div>
                )}

                {/* ===== ADMIN TAB ===== */}
                {activeTab === "admin" && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                        {adminLoading && <div className="py-12 text-center text-muted-foreground animate-pulse">加载管理数据中...</div>}
                        {adminError && (
                            <div className="py-12 text-center text-destructive">
                                <ShieldAlert size={40} className="mx-auto mb-3 opacity-60" />
                                <p>{adminError}</p>
                            </div>
                        )}

                        {adminData && (
                            <>
                                {/* Stats summary */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 text-center">
                                        <Users size={18} className="mx-auto text-primary mb-1" />
                                        <p className="text-lg font-bold">{adminData.users.length}</p>
                                        <p className="text-[10px] text-muted-foreground">注册用户</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 text-center">
                                        <Zap size={18} className="mx-auto text-primary mb-1" />
                                        <p className="text-lg font-bold">{adminData.ideas.length}</p>
                                        <p className="text-[10px] text-muted-foreground">闪念笔记</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 text-center">
                                        <Vote size={18} className="mx-auto text-primary mb-1" />
                                        <p className="text-lg font-bold">{adminData.polls.length}</p>
                                        <p className="text-[10px] text-muted-foreground">投票活动</p>
                                    </div>
                                </div>

                                {/* Ideas section */}
                                <div className="rounded-2xl bg-secondary/30 border border-border/50 overflow-hidden">
                                    <button onClick={() => setExpandedSection(expandedSection === "ideas" ? null : "ideas")} className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                                        <div className="flex items-center gap-2 text-sm font-semibold"><Zap size={16} className="text-primary" /> 闪念笔记 ({adminData.ideas.length})</div>
                                        {expandedSection === "ideas" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    {expandedSection === "ideas" && (
                                        <ul className="divide-y divide-border/30 border-t border-border/30">
                                            {adminData.ideas.map((idea: any) => (
                                                <li key={idea.id} className="px-4 py-3 text-sm">
                                                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                                        <span className="font-mono bg-background px-1.5 py-0.5 rounded text-[10px]">{idea.userEmail}</span>
                                                        <span>{formatDistanceToNow(idea.createdAt, { addSuffix: true, locale: zhCN })}</span>
                                                    </div>
                                                    <p className="text-foreground">{idea.type === 'text' ? idea.content : `[${idea.type}]`}</p>
                                                    {idea.tags?.length > 0 && (
                                                        <div className="flex gap-1 mt-1">{idea.tags.map((t: string) => <span key={t} className="text-[10px] bg-secondary px-1.5 rounded-full text-muted-foreground">{t}</span>)}</div>
                                                    )}
                                                </li>
                                            ))}
                                            {adminData.ideas.length === 0 && <li className="p-4 text-center text-muted-foreground text-xs">暂无数据</li>}
                                        </ul>
                                    )}
                                </div>

                                {/* Polls section */}
                                <div className="rounded-2xl bg-secondary/30 border border-border/50 overflow-hidden">
                                    <button onClick={() => setExpandedSection(expandedSection === "polls" ? null : "polls")} className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                                        <div className="flex items-center gap-2 text-sm font-semibold"><Vote size={16} className="text-primary" /> 投票活动 ({adminData.polls.length})</div>
                                        {expandedSection === "polls" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    {expandedSection === "polls" && (
                                        <ul className="divide-y divide-border/30 border-t border-border/30">
                                            {adminData.polls.map((poll: any) => (
                                                <li key={poll.id} className="px-4 py-3 text-sm">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="font-semibold">{poll.title}</span>
                                                        <span className={cn("text-[10px] px-2 py-0.5 rounded-full", poll.isActive ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400")}>{poll.isActive ? "进行中" : "已关闭"}</span>
                                                    </div>
                                                    <div className="flex gap-3 text-xs text-muted-foreground">
                                                        <span>{poll.userEmail}</span>
                                                        <span>{poll.optionCount} 个选项</span>
                                                        <span>{poll.responseCount} 人参与</span>
                                                        <span>{formatDistanceToNow(poll.createdAt, { addSuffix: true, locale: zhCN })}</span>
                                                    </div>
                                                </li>
                                            ))}
                                            {adminData.polls.length === 0 && <li className="p-4 text-center text-muted-foreground text-xs">暂无数据</li>}
                                        </ul>
                                    )}
                                </div>

                                {/* Users section */}
                                <div className="rounded-2xl bg-secondary/30 border border-border/50 overflow-hidden">
                                    <button onClick={() => setExpandedSection(expandedSection === "users" ? null : "users")} className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
                                        <div className="flex items-center gap-2 text-sm font-semibold"><Users size={16} className="text-primary" /> 注册用户 ({adminData.users.length})</div>
                                        {expandedSection === "users" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                    </button>
                                    {expandedSection === "users" && (
                                        <ul className="divide-y divide-border/30 border-t border-border/30">
                                            {adminData.users.map((u: any) => (
                                                <li key={u.id} className="px-4 py-3 flex items-center justify-between hover:bg-secondary/30 transition-colors">
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-medium">{u.email}</span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">ID: {u.id.substring(0, 12)}...</span>
                                                    </div>

                                                    {u.email !== 'meshnet@163.com' && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="h-7 text-xs border-orange-500/30 text-orange-600 hover:bg-orange-500/10 hover:text-orange-600"
                                                            onClick={async () => {
                                                                if (!confirm(`确定要强制重置 ${u.email} 的密码吗？其下次登录将被拦截要求输入新密码。`)) return;
                                                                try {
                                                                    const res = await fetch('/api/admin', {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ action: 'FLAG_PASSWORD_RESET', targetUserId: u.id })
                                                                    });
                                                                    const data = await res.json();
                                                                    if (res.ok && data.success) {
                                                                        alert("标记成功！该用户下次登录时将被强制重置密码。");
                                                                    } else {
                                                                        alert(data.error || "操作失败");
                                                                    }
                                                                } catch (e) {
                                                                    alert("网络错误");
                                                                }
                                                            }}
                                                        >
                                                            要求重置密码
                                                        </Button>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
