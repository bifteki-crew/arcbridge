"use client";

import React from "react";
import { UserCard } from "../../src/components/UserCard";
import { ClientCounter } from "../../src/components/ClientCounter";

export default function DashboardPage() {
  return (
    <div>
      <h1>Dashboard</h1>
      <UserCard name="John" email="john@example.com" />
      <ClientCounter />
    </div>
  );
}
