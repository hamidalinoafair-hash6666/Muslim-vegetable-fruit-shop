import { PendingOfflineOrder } from '../types';
import { api } from './api';

const OFFLINE_ORDERS_KEY = 'mvfs_pending_offline_orders_v1';

export function getPendingOfflineOrders(): PendingOfflineOrder[] {
  try {
    const raw = localStorage.getItem(OFFLINE_ORDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePendingOfflineOrders(list: PendingOfflineOrder[]): void {
  localStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent('mvfs-offline-queue-updated', { detail: list }));
}

export function enqueueOfflineOrder(payload: any): PendingOfflineOrder {
  const list = getPendingOfflineOrders();
  const idempotencyKey =
    payload.idempotency_key || `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const entry: PendingOfflineOrder = {
    local_id: `LOCAL-${Date.now().toString().slice(-6)}`,
    idempotency_key: idempotencyKey,
    payload: { ...payload, idempotency_key: idempotencyKey },
    saved_at: new Date().toISOString(),
    sync_status: 'pending_sync',
  };

  list.unshift(entry);
  savePendingOfflineOrders(list);
  return entry;
}

export function removeOfflineOrder(localId: string): void {
  const filtered = getPendingOfflineOrders().filter((o) => o.local_id !== localId);
  savePendingOfflineOrders(filtered);
}

/**
 * Attempts to synchronize all queued offline orders once online.
 * If prices, stock, or delivery fee changed since saving offline,
 * marks the order as `needs_reconfirmation` and NEVER silently submits an altered bill!
 */
export async function syncPendingOfflineOrders(): Promise<{
  syncedOrderIds: string[];
  needsConfirmationCount: number;
}> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { syncedOrderIds: [], needsConfirmationCount: 0 };
  }

  const queue = getPendingOfflineOrders();
  if (queue.length === 0) return { syncedOrderIds: [], needsConfirmationCount: 0 };

  const remaining: PendingOfflineOrder[] = [];
  const syncedOrderIds: string[] = [];
  let needsConfirmationCount = 0;

  for (const item of queue) {
    if (item.sync_status === 'needs_reconfirmation') {
      remaining.push(item);
      needsConfirmationCount += 1;
      continue;
    }

    try {
      const check = await api.revalidateOfflineOrder(item.payload);
      if (check.changed) {
        remaining.push({
          ...item,
          sync_status: 'needs_reconfirmation',
          revalidation_diff: {
            old_subtotal: check.old_subtotal,
            new_subtotal: check.new_subtotal,
            old_delivery_fee: check.old_delivery_fee,
            new_delivery_fee: check.new_delivery_fee,
            old_total: check.old_total,
            new_total: check.new_total,
            changes: check.changes || [],
          },
          payload: check.updatedPayload || item.payload,
        });
        needsConfirmationCount += 1;
      } else {
        const { order } = await api.createOrder(item.payload);
        syncedOrderIds.push(order.id);
      }
    } catch (err: any) {
      remaining.push({
        ...item,
        sync_status: 'sync_error',
        sync_error: err?.message || 'Synchronization failed',
      });
    }
  }

  savePendingOfflineOrders(remaining);
  return { syncedOrderIds, needsConfirmationCount };
}
