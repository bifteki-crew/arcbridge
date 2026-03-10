"use client";

import React, { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");

  return (
    <form>
      <input value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit">Login</button>
    </form>
  );
}
