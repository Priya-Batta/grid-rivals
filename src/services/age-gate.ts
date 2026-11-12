import { ensureAnonymousSession, getConfiguredSupabaseClient } from "./supabase-client.ts";

export type AgeGateStatus = {
  confirmed: boolean;
  eligible?: boolean;
  country?: "IN" | "OTHER";
  policyVersion?: number;
};

async function invokeAgeGate(body: Record<string, unknown>): Promise<AgeGateStatus> {
  await ensureAnonymousSession();
  const client = getConfiguredSupabaseClient();
  const { data, error } = await client.functions.invoke<AgeGateStatus>("age-gate", { body });
  if (error) throw new Error("Could not check age confirmation. Please retry.");
  if (!data || typeof data.confirmed !== "boolean") throw new Error("The age confirmation service returned an invalid response.");
  return data;
}

export function fetchAgeGateStatus(): Promise<AgeGateStatus> {
  return invokeAgeGate({ action: "status" });
}

export async function confirmAgeEligibility(country: "IN" | "OTHER", eligible: boolean): Promise<AgeGateStatus> {
  const result = await invokeAgeGate({ action: "confirm", country, eligible });
  if (result.confirmed && result.eligible === true) {
    const client = getConfiguredSupabaseClient();
    const { data, error } = await client.auth.refreshSession();
    if (error || !data.session) throw new Error("Your confirmation was saved, but the session could not be refreshed. Reload and retry.");
  }
  return result;
}
