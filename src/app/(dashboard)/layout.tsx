import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user has any collectives — if not, redirect to onboarding
  const { count } = await supabase
    .from("collective_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (!count || count === 0) {
    redirect("/onboarding");
  }

  // Fetch user profile
  const { data: profile } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  // Fetch user's collectives
  const { data: memberships } = await supabase
    .from("collective_members")
    .select("collective_id, role, collectives(id, name, slug, logo_url)")
    .eq("user_id", user.id);

  const collectives =
    memberships?.map((m) => {
      const c = m.collectives as unknown as { id: string; name: string; slug: string; logo_url: string | null };
      return { ...c, role: m.role };
    }) ?? [];

  return (
    <DashboardShell
      user={{ id: user.id, email: user.email ?? "", fullName: profile?.full_name ?? "" }}
      collectives={collectives}
    >
      {children}
    </DashboardShell>
  );
}
