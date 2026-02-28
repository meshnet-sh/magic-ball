import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
            <TooltipProvider>
                <Sidebar />
                <div className="flex flex-1 flex-col overflow-hidden">
                    <Header />
                    <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 pt-6 pb-28 md:p-6 md:pb-6 lg:p-8 relative flex flex-col">
                        {children}
                    </main>
                </div>
            </TooltipProvider>
        </div>
    );
}
