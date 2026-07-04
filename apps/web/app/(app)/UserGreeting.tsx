"use client";

import { useEffect, useState } from "react";

export function UserGreeting({ initialName }: { initialName: string }) {
  const [name, setName] = useState(initialName);

  useEffect(() => {
    const savedName = window.localStorage.getItem("tour:selectedUserName");
    if (savedName) setName(savedName);

    function handleUserChange(event: Event) {
      const detail = (event as CustomEvent<{ name?: string }>).detail;
      if (detail?.name) setName(detail.name);
    }

    window.addEventListener("tour:selected-user-change", handleUserChange);
    return () => window.removeEventListener("tour:selected-user-change", handleUserChange);
  }, []);

  return <h1>Good morning, {name}!</h1>;
}
