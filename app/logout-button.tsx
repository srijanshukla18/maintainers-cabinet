"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/api/auth/github/start");
  }

  return (
    <button
      onClick={() => void logout()}
      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-500 transition hover:bg-gray-50 hover:text-gray-900"
    >
      Log out
    </button>
  );
}

