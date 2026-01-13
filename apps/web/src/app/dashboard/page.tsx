"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    api.get("/api/dashboard")
      .then(res => setStats(res.data.stats))
      .catch(err => console.error("Dashboard API error:", err));
  }, []);

  if (!stats) return <p>Loading dashboard...</p>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <div className="card">Patients: {stats.patients}</div>
      <div className="card">Appointments: {stats.appointments}</div>
      <div className="card">Services: {stats.services}</div>
    </div>
  );
}
