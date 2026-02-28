import { Construction } from "lucide-react";

export default function ApiPlaceholderPage() {
    return (
        <div className="flex flex-col items-center justify-center h-full min-h-[70vh] w-full max-w-2xl mx-auto px-4 text-center animate-in fade-in zoom-in-95 duration-500">
            <div className="p-trailing bg-primary/10 p-6 rounded-full mb-6 relative">
                <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full" />
                <Construction size={48} className="text-primary relative z-10 animate-bounce" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight mb-4">外部接口中心</h1>
            <p className="text-muted-foreground text-lg mb-8 max-w-md leading-relaxed">
                此处是外部功能接口（Webhooks, API Gateway）的预留位置。<br />
                未来您将能在这里管理接入的所有外部系统的端点和鉴权密钥。
            </p>
            <div className="inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-2 text-sm font-medium text-muted-foreground border border-border/50 border-dashed">
                🚧 模块开发中...
            </div>
        </div>
    );
}
