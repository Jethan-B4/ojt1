import { supabase } from "./client";

export type DivisionRow = { division_id: number; division_name: string };
export type RoleRow = { role_id: number; role_name: string };

export async function fetchAllDivisions(): Promise<DivisionRow[]> {
  const { data, error } = await supabase
    .from("divisions")
    .select("division_id, division_name")
    .order("division_id");
  if (error) throw error;
  return (data ?? []) as DivisionRow[];
}

export async function fetchAllRoles(): Promise<RoleRow[]> {
  const { data, error } = await supabase
    .from("roles")
    .select("role_id, role_name")
    .order("role_id");
  if (error) throw error;
  return (data ?? []) as RoleRow[];
}

export async function createUser(payload: {
  username: string;
  fullname: string;
  password: string;
  division_id?: number | null;
  role_id: number;
  last_login?: string | null;
}) {
  const { data, error } = await supabase
    .from("users")
    .insert({
      username: payload.username,
      fullname: payload.fullname,
      password: payload.password,
      division_id: payload.division_id ?? null,
      role_id: payload.role_id,
      last_login: payload.last_login ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateUser(
  userId: string,
  patch: Partial<{
    username: string;
    fullname: string;
    password: string;
    division_id: number | null;
    role_id: number;
  }>,
) {
  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("username", userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .delete()
    .eq("username", userId);
  if (error) throw error;
}

export async function updateLastLogin(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ last_login: new Date().toISOString() })
    .eq("username", userId);
  if (error) throw error;
}

export async function fetchAllUsers(): Promise<
  Array<{
    username: string;
    fullname: string;
    division_id: number | null;
    role_id: number;
    created_at: string | null;
    last_login: string | null;
    division_name: string | null;
    role_name: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "username, fullname, division_id, role_id, created_at, last_login, divisions(division_name), roles(role_name)",
    )
    .order("fullname", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((u: any) => ({
    username: u.username,
    fullname: u.fullname,
    division_id: u.division_id ?? null,
    role_id: u.role_id,
    created_at: u.created_at ?? null,
    last_login: u.last_login ?? null,
    division_name: u.divisions?.division_name ?? null,
    role_name: u.roles?.role_name ?? null,
  }));
}
