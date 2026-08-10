"use client";

import { signOut } from "./actions";

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut()}
      className="mono"
      style={{ fontSize: 11.5, color: "#6B6B66", background: "none", border: "1px solid #D8D6D0", padding: "8px 14px", cursor: "pointer" }}
    >
      SIGN OUT
    </button>
  );
}
