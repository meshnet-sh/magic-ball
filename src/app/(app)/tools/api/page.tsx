"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plug, ShieldAlert, Link2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ApiDashboardPage() {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);
    const [n8nStatus, setN8nStatus] = useState<"connected" | "disconnected">("disconnected");
    const [n8nUrl, setN8nUrl] = useState("");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const res = await fetch("/api/settings");
                const data = await res.json();

                if (data.success) {
                    setIsAdmin(data.isAdmin);
                    if (data.data.integrations) {
                        try {
                            const parsed = JSON.parse(data.data.integrations);
                            if (parsed.n8n && parsed.n8n.url) {
                                setN8nUrl(parsed.n8n.url);
                                setN8nStatus("connected");
                            }
                        } catch (e) { }
                    }
                }
            } catch (error) {
                console.error("Failed to load settings:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSettings();
    }, []);

    if (isLoading) {
        return <div className="flex h-full items-center justify-center text-muted-foreground animate-pulse">加载中...</div>;
    }

    // Removed admin check to allow all users to access their integration dashboard.

    return (
        <div className="flex flex-col h-full w-full max-w-5xl mx-auto p-4 md:p-6 lg:p-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-primary/10 rounded-xl">
                        <Plug className="text-primary" size={24} />
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">外部接口中心</h1>
                </div>
                <p className="text-muted-foreground">统一管理和监控系统接入的外部应用与自动化工作流。</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* n8n Integration Card */}
                <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-sm flex flex-col hover:border-primary/30 transition-colors">
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-secondary rounded-xl">
                                <Link2 className="text-foreground" size={20} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-lg">n8n</h3>
                                <p className="text-xs text-muted-foreground">节点自动化平台</p>
                            </div>
                        </div>
                        {n8nStatus === "connected" ? (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-green-500 bg-green-500/10 px-2.5 py-1 rounded-full">
                                <CheckCircle2 size={14} /> 已连接
                            </span>
                        ) : (
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground bg-secondary px-2.5 py-1 rounded-full">
                                <XCircle size={14} /> 未配置
                            </span>
                        )}
                    </div>

                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground mb-4">
                            通过 Webhook 连接 n8n。使用 AI 与该平台进行交互，或允许外部回调写入 Magic-Ball。
                        </p>
                        {n8nStatus === "connected" && n8nUrl && (
                            <div className="bg-secondary/50 p-3 rounded-lg border border-border/50 text-xs font-mono text-muted-foreground truncate" title={n8nUrl}>
                                Hook: {n8nUrl}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 pt-6 border-t border-border/50 flex gap-3">
                        <Button
                            variant="default"
                            className="bg-primary/10 text-primary hover:bg-primary/20 flex-1"
                            onClick={() => router.push("/settings")}
                        >
                            去设置配置
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
