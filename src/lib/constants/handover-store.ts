import type { SupabaseClient } from '@supabase/supabase-js';

export interface HandoverRecord {
  key_status: 'pending' | 'handed_over' | 'returned';
  key_handed_at?: string | null;
  key_handed_by?: string | null;
  key_returned_at?: string | null;
  key_returned_by?: string | null;
  updated_at?: string;
}

export type HandoverRegistry = Record<string, HandoverRecord>;

const SETTINGS_KEY = 'security_handovers';

export async function getHandoverRegistryFromDb(supabase: SupabaseClient): Promise<HandoverRegistry> {
  try {
    const { data } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle();

    if (data?.value && typeof data.value === 'object') {
      return data.value as HandoverRegistry;
    }
  } catch (err) {
    console.warn('Could not read handover registry from system_settings:', err);
  }
  return {};
}

export async function saveHandoverRecordToDb(
  supabase: SupabaseClient,
  proposalId: string,
  record: HandoverRecord,
  actorEmail: string
): Promise<HandoverRegistry> {
  let currentRegistry: HandoverRegistry = {};
  try {
    currentRegistry = await getHandoverRegistryFromDb(supabase);
  } catch {}

  const updatedRegistry: HandoverRegistry = {
    ...currentRegistry,
    [proposalId]: {
      ...currentRegistry[proposalId],
      ...record,
      updated_at: new Date().toISOString(),
    },
  };

  try {
    await supabase.from('system_settings').upsert({
      key: SETTINGS_KEY,
      value: updatedRegistry,
      updated_by: actorEmail,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Could not save handover registry to system_settings:', err);
  }

  return updatedRegistry;
}
