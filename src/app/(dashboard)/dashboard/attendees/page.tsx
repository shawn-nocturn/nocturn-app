"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, UserCheck, DollarSign, Download, Search } from "lucide-react";
import { getAttendees, exportAttendeesCSV, type AttendeeRow, type AttendeeStats } from "@/app/actions/attendees";

export default function AttendeesPage() {
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);
  const [stats, setStats] = useState<AttendeeStats>({ totalAttendees: 0, repeatAttendees: 0, totalRevenue: 0 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAttendees().then((result) => {
      setAttendees(result.attendees);
      setStats(result.stats);
      setLoading(false);
    });
  }, []);

  const filtered = attendees.filter((a) =>
    a.email.toLowerCase().includes(search.toLowerCase())
  );

  async function handleExport() {
    const result = await exportAttendeesCSV();
    if (result.csv) {
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nocturn-attendees-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nocturn border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Attendees</h1>
          <p className="text-sm text-muted-foreground">
            Your audience from ticket purchases
          </p>
        </div>
        {attendees.length > 0 && (
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-nocturn/10">
              <Users className="h-5 w-5 text-nocturn" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Attendees</p>
              <p className="text-xl font-bold">{stats.totalAttendees}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
              <UserCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Repeat (2+ events)</p>
              <p className="text-xl font-bold">{stats.repeatAttendees}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10">
              <DollarSign className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Revenue</p>
              <p className="text-xl font-bold">${stats.totalRevenue.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      {attendees.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      )}

      {/* Attendee list */}
      {filtered.length > 0 ? (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2 px-4 text-xs font-medium text-muted-foreground">
            <span className="col-span-2">Email</span>
            <span className="text-center">Events</span>
            <span className="text-center">Tickets</span>
            <span className="text-right">Total Spent</span>
          </div>
          {filtered.map((attendee) => (
            <Card key={attendee.email}>
              <CardContent className="grid grid-cols-5 items-center gap-2 p-4">
                <div className="col-span-2 min-w-0">
                  <p className="truncate font-medium text-sm">{attendee.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {attendee.eventTitles.slice(0, 2).join(", ")}
                    {attendee.eventTitles.length > 2 && ` +${attendee.eventTitles.length - 2} more`}
                  </p>
                </div>
                <p className="text-center text-sm">{attendee.totalEvents}</p>
                <p className="text-center text-sm">{attendee.ticketCount}</p>
                <p className="text-right font-medium text-nocturn">
                  ${attendee.totalSpent.toFixed(2)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : attendees.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nocturn/10">
              <Users className="h-8 w-8 text-nocturn" />
            </div>
            <div className="text-center">
              <p className="font-medium">No attendees yet</p>
              <p className="text-sm text-muted-foreground">
                When people buy tickets to your events, they&apos;ll appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground py-8">
          No attendees match &quot;{search}&quot;
        </p>
      )}
    </div>
  );
}
