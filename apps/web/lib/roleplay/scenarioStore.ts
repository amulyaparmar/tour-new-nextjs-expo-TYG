// Scenario persistence for the Roleplay Training feature.
//
// Ported from usevoice.ai-TYG, where v1 stored scenarios in a local JSON file
// (serverless-hostile, single-tenant). Here scenarios live in the
// PROPERTY-SCOPED `roleplay_scenarios` table (composite key property_id + id;
// whole scenario as jsonb), via the service-role client like every other lib
// module. Each property gets the two default scenarios seeded on its first
// list.
//
// SERVER-ONLY: import from API routes only, never client components.

import "server-only";

import { getSupabaseServiceClient } from "@/lib/supabase";
import { RoleplayScenario } from "./types";
import { SEED_SCENARIOS } from "./seedScenarios";

const TABLE = "roleplay_scenarios";

export interface ScenarioStore {
  list(propertyId: string): Promise<RoleplayScenario[]>;
  get(propertyId: string, id: string): Promise<RoleplayScenario | undefined>;
  upsert(propertyId: string, scenario: RoleplayScenario): Promise<RoleplayScenario>;
  remove(propertyId: string, id: string): Promise<boolean>;
}

// Only dress a Supabase error up as "run the migration" when it actually looks
// like a missing table — wrapping every error in that hint sent operators
// re-running an already-applied migration (adversarial-review finding).
const storeError = (message: string) =>
  /schema cache|does not exist|relation/i.test(message)
    ? new Error(
        `roleplay_scenarios unavailable (${message}) — has the create_roleplay_tables migration been applied?`
      )
    : new Error(message);

class SupabaseScenarioStore implements ScenarioStore {
  private seededProperties = new Set<string>();

  private async seedIfEmpty(propertyId: string): Promise<void> {
    if (this.seededProperties.has(propertyId)) return;
    const supabase = getSupabaseServiceClient();
    const { count, error } = await supabase
      .from(TABLE)
      .select("id", { count: "exact", head: true })
      .eq("property_id", propertyId);
    if (error) throw storeError(error.message);
    if ((count ?? 0) === 0) {
      const rows = SEED_SCENARIOS.map((scenario) => ({
        property_id: propertyId,
        id: scenario.id,
        data: scenario,
        created_at: scenario.createdAt,
        updated_at: scenario.updatedAt,
      }));
      // ignoreDuplicates: two concurrent first-lists (StrictMode double-fetch,
      // two tabs) must both succeed rather than one dying on the primary key.
      const { error: insertError } = await supabase
        .from(TABLE)
        .upsert(rows as never, { onConflict: "property_id,id", ignoreDuplicates: true });
      if (insertError) throw storeError(insertError.message);
    }
    this.seededProperties.add(propertyId);
  }

  async list(propertyId: string): Promise<RoleplayScenario[]> {
    await this.seedIfEmpty(propertyId);
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("property_id", propertyId)
      .order("updated_at", { ascending: false });
    if (error) throw storeError(error.message);
    return (data ?? []).map((row) => (row as { data: RoleplayScenario }).data);
  }

  async get(propertyId: string, id: string): Promise<RoleplayScenario | undefined> {
    await this.seedIfEmpty(propertyId);
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("data")
      .eq("property_id", propertyId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw storeError(error.message);
    return data ? (data as { data: RoleplayScenario }).data : undefined;
  }

  async upsert(propertyId: string, scenario: RoleplayScenario): Promise<RoleplayScenario> {
    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.from(TABLE).upsert(
      {
        property_id: propertyId,
        id: scenario.id,
        data: scenario,
        created_at: scenario.createdAt,
        updated_at: scenario.updatedAt,
      } as never,
      { onConflict: "property_id,id" }
    );
    if (error) throw storeError(error.message);
    return scenario;
  }

  async remove(propertyId: string, id: string): Promise<boolean> {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("property_id", propertyId)
      .eq("id", id)
      .select("id");
    if (error) throw storeError(error.message);
    return (data ?? []).length > 0;
  }
}

export const scenarioStore: ScenarioStore = new SupabaseScenarioStore();
