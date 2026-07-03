import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AdminAuthError, requireAdminContext } from "./admin-auth";

export async function requireTourWorkspace() {
  const requestHeaders = await headers();
  try {
    return await requireAdminContext(new Request("http://tour.local", {
      headers: requestHeaders,
    }));
  } catch (caught) {
    if (caught instanceof AdminAuthError) redirect("/login");
    throw caught;
  }
}
