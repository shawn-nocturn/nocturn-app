import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { DollarSign, TrendingUp, Receipt, Wallet } from "lucide-react";

export default async function FinancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get user's collectives
  const { data: memberships } = await supabase
    .from("collective_members")
    .select("collective_id")
    .eq("user_id", user!.id);

  const collectiveIds = memberships?.map((m) => m.collective_id) ?? [];

  // Get settlements
  let settlements: Array<{
    id: string;
    total_revenue: number;
    total_costs: number;
    net_profit: number;
    status: string;
    created_at: string;
    events: { title: string } | null;
  }> = [];

  if (collectiveIds.length > 0) {
    const { data } = await supabase
      .from("settlements")
      .select("id, total_revenue, total_costs, net_profit, status, created_at, events(title)")
      .in("collective_id", collectiveIds)
      .order("created_at", { ascending: false })
      .limit(10);
    settlements = (data ?? []) as unknown as typeof settlements;
  }

  const totalRevenue = settlements.reduce((sum, s) => sum + (s.total_revenue || 0), 0);
  const totalProfit = settlements.reduce((sum, s) => sum + (s.net_profit || 0), 0);
  const pendingSettlements = settlements.filter((s) => s.status !== "paid_out").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Revenue, settlements, and payouts
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Total Revenue"
          value={`$${totalRevenue.toLocaleString()}`}
          color="text-nocturn"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Net Profit"
          value={`$${totalProfit.toLocaleString()}`}
          color="text-emerald-500"
        />
        <StatCard
          icon={<Receipt className="h-5 w-5" />}
          label="Settlements"
          value={settlements.length.toString()}
          color="text-nocturn-teal"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Pending"
          value={pendingSettlements.toString()}
          color="text-yellow-500"
        />
      </div>

      {/* Settlements list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settlements</CardTitle>
          <CardDescription>Post-event financial breakdowns</CardDescription>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8">
              <DollarSign className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                No settlements yet. Complete an event to see financial breakdowns here.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {settlements.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {s.events?.title ?? "Untitled Event"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-emerald-500">
                      ${s.net_profit.toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground capitalize">{s.status.replace("_", " ")}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className={`${color}`}>{icon}</div>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
