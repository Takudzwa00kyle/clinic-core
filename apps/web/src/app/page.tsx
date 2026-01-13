"use client";

import Image from "next/image";
import { useEffect } from "react";
import { api } from "@/lib/api";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  useEffect(() => {
    api.get("/")
      .then(res => {
        console.log("Backend response:", res.data);
      })
      .catch(err => {
        console.error("API error:", err);
      });
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Patients</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            120
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointments Today</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            8
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">
            $2,400
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

