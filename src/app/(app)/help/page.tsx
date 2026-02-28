import { ArrowLeft, BookOpen, Shield, Zap, Vote, Calendar, Plug } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HelpPage() {
    return (
        <div className="flex flex-col h-full w-full max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-500 pb-20">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8 sticky top-0 bg-background/80 backdrop-blur-xl z-20 top-0 py-4 border-b border-border/50">
                <Link href="/">
                    <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-full">
                        <ArrowLeft size={20} />
                    </Button>
                </Link>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <BookOpen size={24} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">使用帮助与系统说明</h1>
                        <p className="text-xs text-muted-foreground mt-0.5 font-mono">Magic Ball / User Guide</p>
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="prose prose-neutral dark:prose-invert prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary max-w-none px-4 md:px-8">

                <h2 className="flex items-center gap-2"><Shield className="text-primary w-6 h-6" /> 引言：多租户与邀请注册</h2>
                <p>
                    欢迎使用 Magic Ball！本系统已升级为<b>多租户安全架构</b>。
                    新用户无法直接注册，必须在登录界面点击「申请注册」并输入由管理员提供的官方邀请码（<code>meshnet</code>）方可创建账号。
                </p>
                <ul>
                    <li><b>独立数据流：</b> 每位用户的闪念笔记、日程任务、以及投票记录都是完全隔离的私密数据。</li>
                    <li><b>忘记密码：</b> 为保障安全，系统不设找回密码功能。一旦遗忘，请联系系统管理员。管理员在后台将您标记为「要求重置密码」后，您下次即可使用任意新密码直接覆写登录。</li>
                </ul>

                <hr className="my-8 border-border/50" />

                <h2 className="flex items-center gap-2"><Zap className="text-orange-500 w-6 h-6" /> 工具一：AI 指令中心 & 闪念笔记</h2>
                <p>
                    系统最核心的是全局的 <b>AI 驱动对话系统</b> 和 <b>Fast Idea Logger (闪念笔记)</b>。
                </p>
                <h3>自然语言控制</h3>
                <p>
                    在首页的 AI 指令中心，您可以直接通过语音或文字指挥 AI 为您执行绝大部分操作，无需手动前往各个页面。例如：
                </p>
                <ul>
                    <li><i>“帮我记录一个闪念：今天天气真好，记得带伞。加个标签叫做 #生活”</i></li>
                    <li><i>“帮我建个投票，问问大家周末去爬山还是看电影，单选题。”</i></li>
                    <li><i>“明早9点提醒我参加项目复盘会。”</i></li>
                </ul>

                <h3>闪念笔记操作指南</h3>
                <p>
                    在「闪念笔记」工具卡片内，您可以随心记录生活灵感。
                </p>
                <ul>
                    <li><b>多媒体记录：</b> 点击底部的 📸 图标上传照片，或者长按/点击 🎤 麦克风直接录下一段语音。</li>
                    <li><b>标签系统：</b> 在任何一段文字中输入 <code>#你的标签</code>（如 #todo, #reading），AI 会提取它并自动为笔记打上高亮标签，方便后续通过 AI 搜索。</li>
                    <li><b>微信/飞书 兼容：</b> 您还可以通过配置飞书机器人，在手机端直接转发语音消息给机器人，后台会自动使用 <code>Gemini 2.0 Flash</code> 音频模型将您的口述精准存入云端闪念列表。</li>
                </ul>

                <hr className="my-8 border-border/50" />

                <h2 className="flex items-center gap-2"><Vote className="text-blue-500 w-6 h-6" /> 工具二：防刷票匿名投票系统</h2>
                <p>
                    当面临团队团建决策、晚餐统计等场景，您可以随时创建一个投票应用。
                </p>
                <ul>
                    <li>建立投票非常简单（甚至可以让 AI 代劳）。您可以选择将其设为<b>单选</b>或<b>多选</b>。</li>
                    <li><b>访问码保护：</b> 在高隐私要求的场合，建议开启「需要访问码」。参与者必须输入 4-6 位的暗号才能看到选项。</li>
                    <li><b>防刷票风控：</b> 投票链接分享给所有人后，无需登录也可投票。但系统接入了极度严格的 Cloudflare 浏览器安全指纹与 IP 地理位置画像识别技术，同一设备的恶意重复刷票将会在底层被直接拦截。</li>
                </ul>

                <hr className="my-8 border-border/50" />

                <h2 className="flex items-center gap-2"><Calendar className="text-purple-500 w-6 h-6" /> 工具三：Cron 日程调度与自动化</h2>
                <p>
                    Magic Ball 并不是一个死胡同，它拥有一个强大的基于 V8 Isolate 的 Cron 调度器。
                </p>
                <p>
                    通过发送 <i>“每周五下午六点提醒我写周报”</i>，AI 会在底层建立一个 <code>cron: 0 18 * * 5</code> 的计划任务。当时间一到，系统将自动触发。
                </p>
                <div className="bg-secondary/30 p-4 border-l-4 border-primary rounded-r-xl my-4 text-sm text-muted-foreground leading-relaxed">
                    💡 <b>进阶玩法 / 飞书互通：</b><br />
                    为了让这些时间提醒不再局限于“需要打开网站才能看到”，我们强力建议您在「设置 -&gt; 飞书机器人配置」页中绑定您的 <b>飞书 Open ID</b>。绑定后：
                    <ol className="mt-2 mb-0 list-decimal list-inside space-y-1">
                        <li>所有的 Cron 定时任务将会通过飞书机器人直接发送到您的手机锁屏通知。</li>
                        <li>当您给飞书机器人发送语音或文字指令时，Magic Ball 后台接收请求，处理完毕后（例如记录了笔记、建好了投票）立刻回复您操作结果！</li>
                    </ol>
                </div>

                <hr className="my-8 border-border/50" />

                <h2 className="flex items-center gap-2"><Plug className="text-teal-500 w-6 h-6" /> 更多功能：外部功能接口与扩展</h2>
                <p>
                    首页预留的「外部功能接口」目前正在开发中。未来，您的系统将不仅仅局限于内部数据，它将能直接联动您的智能家居、调用外部 API 查询汇率机票、甚至在代码通过编译时给您闪烁网页背景。
                    一切皆有可能，敬请期待！
                </p>

            </div>
        </div>
    );
}
