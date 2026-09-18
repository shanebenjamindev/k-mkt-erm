import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE, SESSION_REFRESH_COOKIE } from "./auth-repository";

export async function currentUser() {
  const cookieStore = await cookies();
  return getSessionUser(cookieStore.get(SESSION_COOKIE)?.value);
}

export async function currentToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function currentRefreshToken() {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_REFRESH_COOKIE)?.value;
}
