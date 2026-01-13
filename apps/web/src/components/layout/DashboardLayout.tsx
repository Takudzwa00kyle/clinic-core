import React from 'react';
import { Sidebar } from "./Sidebar";
import { TopNav } from "./TopNav";

export function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopNav />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
