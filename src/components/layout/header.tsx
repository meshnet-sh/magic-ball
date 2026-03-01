"use client"

import { useTheme } from "next-themes"
import { Moon, Sun, Menu } from "lucide-react"
import { Button } from "../ui/button"
import { usePathname } from "next/navigation"
import { useUIStore } from "@/store/ui-store"

export function Header() {
    const { theme, setTheme } = useTheme()
    const pathname = usePathname()
    const { toggleSidebar } = useUIStore()

    // Quick breadcrumb generation
    const pageName = pathname === "/"
        ? "Magic Ball"
        : pathname.split("/").pop()?.replace("-", " ") || "Magic Ball"

    return (
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-background/60 backdrop-blur-xl px-4 md:px-6 sticky top-0 z-40">
            <div className="flex items-center gap-4">
                {/* Mobile menu trigger */}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className="md:hidden -ml-2 text-muted-foreground hover:text-foreground"
                >
                    <Menu className="h-5 w-5" />
                    <span className="sr-only">Toggle menu</span>
                </Button>
                <h1 className="text-sm font-semibold capitalize text-foreground/80 tracking-wide">{pageName}</h1>
            </div>
            <div className="flex items-center gap-4">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    className="rounded-full bg-secondary/50 hover:bg-secondary border border-border/50 transition-all"
                >
                    <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span className="sr-only">Toggle theme</span>
                </Button>
            </div>
        </header>
    )
}
