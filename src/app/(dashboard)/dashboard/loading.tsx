import { Sparkles } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col items-center gap-3 py-20">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-nocturn/10 animate-pulse-glow">
        <Sparkles className="h-6 w-6 text-nocturn" />
      </div>
      <p className="text-sm text-muted-foreground animate-pulse">Loading...</p>
    </div>
  );
}
