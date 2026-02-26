"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Shield } from "lucide-react"

export default function LoginPage() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email || !password) return

        setIsLoading(true)
        try {
            const res = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            })

            if (res.ok) {
                router.push("/tools/ideas")
                router.refresh()
            } else {
                const data: any = await res.json()
                alert(data.error || "登录失败")
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
                    <h1 className="text-2xl font-bold tracking-tight">登录以同步闪念</h1>
                    <p className="text-sm text-muted-foreground">您的数据将被端到端云同步隔离保护</p>
                </div>

                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="邮箱 (例如: me@demo.com)"
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="密码 (输入任意组合自动注册/登录)"
                        className="w-full bg-background border border-border/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        required
                    />
                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-6 rounded-xl font-medium mt-2 shadow-lg hover:shadow-primary/25 transition-all"
                    >
                        {isLoading ? "正在验证..." : "安全登录 / 隐式注册"}
                    </Button>
                </form>
            </div>
        </div>
    )
}
