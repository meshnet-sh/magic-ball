"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Shield } from "lucide-react"

export default function LoginPage() {
    const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [inviteCode, setInviteCode] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!password) return
        if (mode !== 'reset' && !email) return
        if (mode === 'register' && !inviteCode) return

        setIsLoading(true)
        try {
            const payload: any = { action: mode, password }
            if (mode !== 'reset') payload.email = email
            if (mode === 'register') payload.inviteCode = inviteCode

            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            })

            const data: any = await res.json()

            if (res.ok) {
                if (data.action_required === 'reset_password') {
                    setMode('reset')
                    setPassword('')
                    alert("管理员要求您重置密码。请输入您的新密码并提交。")
                } else {
                    router.push("/")
                    router.refresh()
                }
            } else {
                alert(data.error || "请求失败")
            }
        } catch (error) {
            alert("网络错误")
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] w-full animate-in fade-in zoom-in-95 duration-500">
            <div className="w-full max-w-sm p-8 bg-secondary/30 backdrop-blur-xl border border-border/50 rounded-3xl shadow-2xl flex flex-col gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 w-32 h-32 bg-primary/10 rounded-full blur-3xl -z-10 translate-x-1/2 -translate-y-1/2"></div>

                <div className="flex flex-col items-center text-center gap-2 mb-2">
                    <div className="p-4 bg-primary/10 rounded-2xl text-primary mb-2 ring-1 ring-primary/20">
                        <Shield size={32} />
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        {mode === 'login' && "登录 Magic Ball"}
                        {mode === 'register' && "注册 Magic Ball"}
                        {mode === 'reset' && "重置密码"}
                    </h1>
                    <p className="text-sm text-muted-foreground">您的全能工具箱，数据云端安全同步</p>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    {mode !== 'reset' && (
                        <input
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="邮箱"
                            className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            required
                        />
                    )}
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder={mode === 'reset' ? "请输入新密码" : "密码"}
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        required
                    />
                    {mode === 'register' && (
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={e => setInviteCode(e.target.value)}
                            placeholder="邀请码 (必填)"
                            className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            required
                        />
                    )}

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-6 rounded-xl font-medium mt-2 shadow-lg hover:shadow-primary/25 transition-all"
                    >
                        {isLoading ? "正在验证..." : mode === 'login' ? "安全登录" : mode === 'register' ? "注册新账号" : "覆盖全网并登录"}
                    </Button>
                </form>

                {mode !== 'reset' && (
                    <div className="text-center text-sm text-muted-foreground mt-2">
                        {mode === 'login' ? (
                            <>还没有账号？ <button onClick={() => setMode('register')} className="text-primary hover:underline" type="button">申请注册</button></>
                        ) : (
                            <>已有账号？ <button onClick={() => setMode('login')} className="text-primary hover:underline" type="button">直接登录</button></>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
