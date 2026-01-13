import React from 'react';
import Link from "next/link";

const links = [
  { name: "Dashboard", href: "/" },
  { name: "Patients", href: "/patients" },
  { name: "Appointments", href: "/appointments" },
  { name: "Services", href: "/services" },
  { name: "Payments", href: "/payments" },
];

export function Sidebar() {
  return (
    <aside className="h-screen w-64 border-r bg-background p-4">
      <h2 className="mb-6 text-xl font-bold">Clinic Core</h2>

      <nav className="space-y-2">
        {links.map(link => (
          <Link
            key={link.name}
            href={link.href}
            className="block rounded-md px-3 py-2 text-sm hover:bg-muted"
          >
            {link.name}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
