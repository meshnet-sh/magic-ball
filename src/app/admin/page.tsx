"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { ShieldAlert, Trash2 } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale"

export default function AdminPage() {
    const [allIdeas, setAllIdeas] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState("")
    const router = useRouter()

    useEffect(() => {
        const fetchAdminData = async () => {
            try {
                const res = await fetch("/api/admin")
                const data: any = await res.json()

                if (res.ok && data.success) {
                    setAllIdeas(data.data)
                } else {
                    setError(data.error || "无权限访问此页面。")
                    if (res.status === 401) {
                        router.replace("/login")
                    }
                }
            } catch (err) {
                setError("网络错误无法加载管理数据")
            } finally {
                setIsLoading(false)
            }
        }

        fetchAdminData()
    }, [router])

    if (isLoading) {
        return <div className="flex h-[50vh] items-center justify-center animate-pulse">验证管理员身份中...</div>
    }

    if (error) {
        return (
            <div className="flex flex-col h-[60vh] items-center justify-center text-center gap-4 text-destructive/80">
                <ShieldAlert size={48} className="text-destructive mb-2" />
                <h2 className="text-2xl font-bold tracking-tight">Access Denied</h2>
                <p>{error}</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto py-8 px-4 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex items-center gap-4 mb-8">
                <div className="p-3 bg-primary/10 rounded-xl text-primary">
                    <ShieldAlert size={28} />
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">上帝视角控制台</h2>
                    <p className="text-sm text-muted-foreground mt-1">系统中所有用户的全景数据记录 ({allIdeas.length} 条)</p>
                </div>
            </div>

            <div className="bg-secondary/30 rounded-2xl border border-border/50 overflow-hidden shadow-xl">
                <ul className="divide-y divide-border/50">
                    {allIdeas.map((idea) => (
                        <li key={idea.id} className="p-4 hover:bg-secondary/50 transition-colors flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-mono bg-background px-2 py-0.5 rounded border border-border/50 text-muted-foreground">
                                    {idea.userEmail || 'Unknown User'}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(idea.createdAt, { addSuffix: true, locale: zhCN })}
                                </span>
                            </div>

                            <div className="mt-1">
                                {idea.type === 'text' && (
                                    <p className="text-sm font-medium text-foreground">{idea.content}</p>
                                )}
                                {idea.type === 'image' && (
                                    <span className="text-sm text-primary flex items-center gap-2">[多媒体图片 - {idea.content.substring(0, 30)}...]</span>
                                )}
                                {idea.type === 'audio' && (
                                    <span className="text-sm text-primary flex items-center gap-2">[语音片段集]</span>
                                )}
                            </div>

                            <div className="flex justify-between items-center mt-2">
                                <div className="flex gap-2">
                                    {idea.tags?.map((tag: string) => (
                                        <span key={tag} className="text-[10px] text-muted-foreground bg-secondary px-2 rounded-full">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                                <span className="text-[10px] text-muted-foreground opacity-50 font-mono">ID: {idea.id}</span>
                            </div>
                        </li>
                    ))}
                    {allIdeas.length === 0 && (
                        <li className="p-8 text-center text-muted-foreground">数据库空空如也</li>
                    )}
                </ul>
            </div>
        </div>
    )
}
