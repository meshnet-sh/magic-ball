"use client"

import { useState, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useIdeasStore, Idea } from "@/store/ideas-store"
import { formatDistanceToNow } from "date-fns"
import { zhCN } from "date-fns/locale/zh-CN"
import { Mic, ImageIcon, Send, Square, Trash2, Cloud, CloudOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function IdeaCard({ idea }: { idea: Idea }) {
    const { removeIdea } = useIdeasStore()
    const [isDeleting, setIsDeleting] = useState(false)

    return (
        <div className="group relative flex flex-col gap-2 p-4 rounded-2xl bg-secondary/30 hover:bg-secondary/50 transition-colors border border-border/50 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex justify-between items-start">
                <span className="text-xs text-muted-foreground font-medium">
                    {formatDistanceToNow(idea.createdAt, { addSuffix: true, locale: zhCN })}
                </span>
                <div className="flex items-center gap-2">
                    {isDeleting ? (
                        <div className="flex gap-2 text-xs items-center px-1">
                            <span className="text-destructive font-medium">确认删除?</span>
                            <button onClick={() => removeIdea(idea.id)} className="text-destructive hover:underline">是</button>
                            <button onClick={() => setIsDeleting(false)} className="text-muted-foreground hover:underline">否</button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setIsDeleting(true)}
                            className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="删除记录"
                        >
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>
            </div>

            {idea.type === 'text' && (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{idea.content}</p>
            )}

            {idea.type === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={idea.content} alt="Idea capture" className="rounded-xl max-h-64 object-cover" />
            )}

            {idea.type === 'audio' && (
                <audio controls src={idea.content} className="h-10 w-full outline-none mt-1" />
            )}

            {idea.tags.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                    {idea.tags.map(tag => (
                        <span key={tag} className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium tracking-wide">
                            {tag}
                        </span>
                    ))}
                </div>
            )}
        </div>
    )
}

export default function IdeasPage() {
    const { ideas, addIdea, sync, isSyncing } = useIdeasStore()
    const [text, setText] = useState("")
    const [isRecording, setIsRecording] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [authError, setAuthError] = useState("")
    const mediaRecorder = useRef<MediaRecorder | null>(null)
    const audioChunks = useRef<Blob[]>([])
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const router = useRouter()

    useEffect(() => {
        const init = async () => {
            try {
                const res = await fetch("/api/auth")
                const data: any = await res.json()
                if (res.ok && data.authenticated) {
                    setIsAuthenticated(true)
                    sync()
                } else {
                    router.replace("/login")
                }
            } catch (error) {
                console.error("Auth check failed", error)
                setAuthError("无法连接到云端服务器或数据库未初始化。请稍后再试。")
            }
        }
        init()

        // Focus only if on desktop width
        if (window.innerWidth > 768) {
            inputRef.current?.focus()
        }

        // Cleanup recorder on unmount
        return () => {
            if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
                mediaRecorder.current.stop()
            }
        }
    }, [router, sync])

    const extractTags = (content: string) => {
        const match = content.match(/#[\w\u4e00-\u9fa5]+/g)
        return match ? Array.from(new Set(match)) : []
    }

    const handleSendText = () => {
        if (!text.trim()) return
        const tags = extractTags(text)
        addIdea('text', text.trim(), tags)
        setText("")
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSendText()
        }
    }

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const recorder = new MediaRecorder(stream)
            audioChunks.current = []

            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.current.push(e.data)
            }

            recorder.onstop = () => {
                const audioBlob = new Blob(audioChunks.current, { type: 'audio/webm' })
                const reader = new FileReader()
                reader.readAsDataURL(audioBlob)
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        addIdea('audio', reader.result)
                    }
                }
                stream.getTracks().forEach(track => track.stop())
            }

            recorder.start()
            mediaRecorder.current = recorder
            setIsRecording(true)
        } catch (err) {
            console.error("Error accessing microphone", err)
            alert("无法访问麦克风，请检查权限设置或确保在 HTTPS 环境下运行。")
        }
    }

    const stopRecording = () => {
        if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
            mediaRecorder.current.stop()
            setIsRecording(false)
        }
    }

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const reader = new FileReader()
        reader.readAsDataURL(file)
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                addIdea('image', reader.result)
            }
        }
        // reset input
        e.target.value = ''
    }

    if (authError) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
                <p className="text-destructive mb-4">{authError}</p>
                <Button onClick={() => window.location.reload()}>重试</Button>
            </div>
        )
    }

    if (!isAuthenticated) return null; // Prevent flash of content before redirect

    return (
        <div className="flex flex-col h-full w-full max-w-2xl mx-auto relative relative">
            <div className="flex items-center justify-between mb-4 shrink-0 px-1">
                <div className="flex items-center gap-3">
                    <h2 className="text-xl font-bold tracking-tight">闪念笔记</h2>
                    {isSyncing ? (
                        <Cloud className="text-primary animate-pulse w-4 h-4" />
                    ) : (
                        <Cloud className="text-muted-foreground/50 w-4 h-4" />
                    )}
                </div>
                <span className="text-xs text-muted-foreground bg-secondary/50 px-3 py-1 rounded-full">{ideas.length} 条记录</span>
            </div>

            {/* Timeline Layout */}
            <div className="flex-1 flex flex-col gap-4 pb-24 overflow-y-auto scrollbar-hide">
                {ideas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 my-auto text-muted-foreground opacity-50 space-y-4">
                        <div className="p-4 bg-secondary/50 rounded-full">
                            <Mic size={32} />
                        </div>
                        <p className="text-sm">还没有灵感？底部可以速记...</p>
                    </div>
                ) : (
                    ideas.map(idea => <IdeaCard key={idea.id} idea={idea} />)
                )}
            </div>

            {/* Modern Sticky Bottom Input Area */}
            <div className="sticky bottom-0 left-0 right-0 bg-background/80 backdrop-blur-3xl border border-border/50 rounded-3xl p-2 shadow-2xl flex items-end gap-2 mb-2 mt-auto transform transition-all duration-300">
                {isRecording ? (
                    <div className="flex-1 flex items-center justify-center p-3 text-destructive animate-pulse font-medium">
                        正在录音...
                    </div>
                ) : (
                    <textarea
                        ref={inputRef}
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="记录闪念... (Ctrl+Enter 发送; 支持 #标签)"
                        className="flex-1 bg-transparent resize-none outline-none max-h-32 min-h-[44px] p-2 text-sm placeholder:text-muted-foreground"
                        rows={text.split('\n').length > 1 ? Math.min(text.split('\n').length, 5) : 1}
                    />
                )}

                {/* Actions */}
                <div className="flex gap-1 pb-1 pr-1 items-center shrink-0">
                    {!isRecording && (
                        <>
                            <input
                                type="file"
                                accept="image/*"
                                // Enable camera directly on mobile phones with capture attribute
                                capture="environment"
                                className="hidden"
                                ref={fileInputRef}
                                onChange={handleImageUpload}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => fileInputRef.current?.click()}
                                className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary rounded-full"
                                title="上传图片/拍照"
                            >
                                <ImageIcon size={20} />
                            </Button>
                        </>
                    )}

                    {isRecording ? (
                        <Button
                            onClick={stopRecording}
                            variant="destructive"
                            size="icon"
                            className="h-10 w-10 shrink-0 rounded-full shadow-md animate-pulse ml-2"
                            title="停止并保存录音"
                        >
                            <Square size={16} fill="currentColor" />
                        </Button>
                    ) : (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={startRecording}
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-primary rounded-full transition-all"
                            title="开始录音"
                        >
                            <Mic size={20} className={cn(!text.trim() && "text-primary scale-110")} />
                        </Button>
                    )}

                    {text.trim() && !isRecording && (
                        <Button
                            onClick={handleSendText}
                            size="icon"
                            className="h-10 w-10 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-md ml-1 animate-in zoom-in-50"
                            title="发送文字"
                        >
                            <Send size={18} className="ml-0.5" />
                        </Button>
                    )}
                </div>
            </div>
        </div>
    )
}
