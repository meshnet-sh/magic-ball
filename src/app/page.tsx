import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, Zap, ArrowRight } from "lucide-react";

import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto h-full animate-in fade-in zoom-in-95 duration-500">

      {/* Hero Header Region */}
      <div className="relative pt-6 pb-4">
        <div className="absolute -top-10 -left-10 w-48 h-48 bg-primary/20 rounded-full blur-3xl" />
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight relative z-10">
          欢迎来到 <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary/50">Magic Ball</span>
        </h1>
        <p className="text-muted-foreground mt-3 text-lg md:text-xl font-medium relative z-10 max-w-xl">
          你个人的、高度可扩展的全能效率工具主控台。
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 mt-2">
        {/* Placeholder for future tools */}
        <Link href="/tools/ideas" className="block outline-none border-none">
          <Card className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] cursor-pointer h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <CardHeader className="flex flex-col pb-2 relative z-10">
              <div className="flex items-start justify-between">
                <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-500">
                  <Zap className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
              </div>
              <CardTitle className="text-xl font-semibold mt-4">闪念笔记</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10">
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                极速无感知的多媒体随身便签。支持 #标签 提取、语音录制和图片上传，数据完全本地私有化。
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="group relative overflow-hidden bg-background/40 backdrop-blur-xl border-border/50 hover:border-primary/50 transition-all duration-500 hover:shadow-[0_0_30px_-5px_hsl(var(--primary)/0.3)] cursor-pointer">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="flex flex-col pb-2 relative z-10">
            <div className="flex items-start justify-between">
              <div className="p-3 rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-500">
                <Calculator className="h-6 w-6" />
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
            </div>
            <CardTitle className="text-xl font-semibold mt-4">全能计算器</CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <p className="text-sm text-muted-foreground leading-relaxed mt-1">
              专为开发者设计的数学计算环境，支持十六进制、二进制与单位极速换算。
            </p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
