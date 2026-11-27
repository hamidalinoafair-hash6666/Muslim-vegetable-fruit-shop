import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl, SUPABASE_PROJECT_CONFIG } from '../data/initialData';

// Live Supabase project credentials
export const SUPABASE_URL = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);

export const SUPABASE_PUBLISHABLE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || SUPABASE_PROJECT_CONFIG.publishable_key).trim();

export const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY).trim();

export function getSupabaseRestHeaders(): Record<string, string> {
  const key = SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY;
  const headers: Record<string, string> = { apikey: key };
  if (key && !key.startsWith('sb_publishable_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}

export const SUPABASE_PROJECT_META = {
  name: "hamidalinoafair-hash6666's Project",
  id: 'gtqvpjwpsxdampdsdvry',
  url: SUPABASE_URL,
  status: 'Healthy',
  region: 'ap-southeast-1',
};

// Initialized live Supabase client with active publishable key
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Checks live connection health to the shop's Supabase instance
 */
export async function checkSupabaseConnection(): Promise<{
  connected: boolean;
  latencyMs: number;
  error?: string;
}> {
  const start = performance.now();
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/vegetables?select=id&limit=1`, {
      method: 'GET',
      headers: getSupabaseRestHeaders(),
    });
    const latencyMs = Math.round(performance.now() - start);
    return {
      connected: res.ok,
      latencyMs,
    };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Math.round(performance.now() - start),
      error: err.message || 'Connection timeout or network failure',
    };
  }
}
