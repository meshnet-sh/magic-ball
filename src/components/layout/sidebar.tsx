"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useUIStore } from "@/store/ui-store"
import { Button } from "@/components/ui/button"
import {
    Box,
    Settings,
    Vote,
    Zap,
    Calendar,
    ChevronsLeft,
    ChevronsRight,
    Sparkles,
    LogOut
} from "lucide-react"
import { useEffect, useState } from "react"

const NAV_ITEMS = [
    { href: "/", label: "仪表盘", icon: Box },
    { href: "/tools/ideas", label: "闪念笔记", icon: Zap },
    { href: "/tools/polls", label: "投票收集", icon: Vote },
    { href: "/tools/scheduler", label: "日程调度", icon: Calendar },
    { href: "/settings", label: "设置", icon: Settings },
]

export function Sidebar() {
    const pathname = usePathname()
    const { isSidebarOpen, toggleSidebar, setSidebarOpen } = useUIStore()
    const [isMobile, setIsMobile] = useState(false)

    // Auto-collapse sidebar on mobile, intercept window resizes
    useEffect(() => {
        const handleResize = () => {
            const mobile = window.innerWidth < 768
            setIsMobile(mobile)
            if (mobile && isSidebarOpen) {
                setSidebarOpen(false)
            } else if (!mobile && !isSidebarOpen) {
                setSidebarOpen(true)
            }
        }

        // Initial check
        handleResize()

        window.addEventListener("resize", handleResize)
        return () => window.removeEventListener("resize", handleResize)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            {/* Mobile Backdrop */}
            {isMobile && isSidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm transition-all duration-100 ease-in-out"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <aside
                className={cn(
                    "absolute inset-y-0 left-0 z-50 flex flex-col border-r bg-background/80 backdrop-blur-2xl transition-all duration-300 md:relative",
                    isSidebarOpen ? "w-64 translate-x-0" : "-translate-x-full md:w-16 md:translate-x-0"
                )}
            >
                <div className={cn("flex h-16 items-center border-b border-border/50 px-3", isSidebarOpen ? "justify-between" : "justify-center")}>
                    {isSidebarOpen && (
                        <div className="flex items-center gap-2">
                            <div className="flex bg-primary/20 text-primary p-1 rounded-md">
                                <Sparkles size={18} />
                            </div>
                            <span className="text-lg font-bold tracking-tight text-foreground bg-clip-text">
                                Magic Ball
                            </span>
                        </div>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleSidebar}
                        className="h-8 w-8 hidden md:flex text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                    >
                        {isSidebarOpen ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
                    </Button>
                </div>

                <nav className="flex-1 space-y-2 p-3 overflow-y-auto">
                    {NAV_ITEMS.map((item) => {
                        const isActive = pathname === item.href
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => {
                                    if (isMobile) setSidebarOpen(false)
                                }}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group relative overflow-hidden",
                                    isActive
                                        ? "bg-primary/10 text-primary border border-primary/20"
                                        : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground border border-transparent",
                                    !isSidebarOpen && "justify-center px-0 py-3"
                                )}
                                title={!isSidebarOpen ? item.label : undefined}
                            >
                                {isActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full" />
                                )}
                                <item.icon size={18} className={cn("shrink-0 transition-transform group-hover:scale-110", isActive && "text-primary")} />
                                {isSidebarOpen && <span className="tracking-wide">{item.label}</span>}
                            </Link>
                        )
                    })}

                    <div className="pt-4 mt-4 border-t border-border/50">
                        <button
                            onClick={async () => {
                                await fetch('/api/auth', { method: 'DELETE' })
                                window.location.href = '/login'
                            }}
                            className={cn(
                                "w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all group overflow-hidden text-red-500/80 hover:bg-red-500/10 hover:text-red-500 border border-transparent",
                                !isSidebarOpen && "justify-center px-0 py-3"
                            )}
                            title={!isSidebarOpen ? "退出登录" : undefined}
                        >
                            <LogOut size={18} className="shrink-0 transition-transform group-hover:-translate-x-1" />
                            {isSidebarOpen && <span className="tracking-wide">退出登录</span>}
                        </button>
                    </div>
                </nav>
            </aside>
        </>
    )
}
