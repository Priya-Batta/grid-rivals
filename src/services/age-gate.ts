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

export function confirmAgeEligibility(country: "IN" | "OTHER", eligible: boolean): Promise<AgeGateStatus> {
  return invokeAgeGate({ action: "confirm", country, eligible });
}
