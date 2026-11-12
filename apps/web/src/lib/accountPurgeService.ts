/**
 * GDPR / NDPR / CCPA Account Erasure & Data Deletion Service.
 * Implements cascading purge: clears local storage, IndexedDB databases, and remote user records.
 */

import { supabase } from './supabase.js';
import { logAuditEvent } from './auditService.js';

export async function purgeAllUserData(
  userId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Log audit record before destruction
    await logAuditEvent({
      userId,
      action: 'compliance.delete',
      targetType: 'account',
      targetId: userId,
      metadata: { reason: 'User requested complete GDPR erasure' },
    });

    // 2. Clear remote records if supabase is present
    if (supabase && userId) {
      try {
        // Delete user's notes
        await supabase.from('meeting_notes').delete().eq('owner_id', userId);
        // Delete user's recordings metadata
        await supabase.from('recordings').delete().eq('started_by', userId);
        // Delete user's rooms
        await supabase.from('rooms').delete().eq('owner_id', userId);
        // Delete user's security settings
        await supabase.from('security_settings').delete().eq('user_id', userId);
        // Delete profile
        await supabase.from('profiles').delete().eq('id', userId);
      } catch {
        // Best effort remote cascade
      }
    }

    // 3. Clear IndexedDB databases
    if (
      typeof indexedDB !== 'undefined' &&
      typeof indexedDB.databases === 'function'
    ) {
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name && db.name.includes('meetit')) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      } catch {
        // ignore
      }
    }

    // 4. Wipe LocalStorage & SessionStorage
    if (typeof localStorage !== 'undefined') {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('meetit') || key.startsWith('sb-'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }

    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.clear();
    }

    // 5. Sign out Supabase auth session
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to complete data erasure',
    };
  }
}
