import { offlineDb, getPendingSyncCount } from './offlineDb';
import { db } from './firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

type SyncListener = (status: SyncStatus, pendingCount: number) => void;

class OfflineSyncService {
  private listeners: Set<SyncListener> = new Set();
  private syncStatus: SyncStatus = 'idle';
  private pendingCount = 0;
  private syncInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    window.addEventListener('online', () => this.startSync());
    if (navigator.onLine) {
      this.schedulePoll();
    }
  }

  subscribe(listener: SyncListener) {
    this.listeners.add(listener);
    listener(this.syncStatus, this.pendingCount);
    return () => this.listeners.delete(listener);
  }

  private notify(status: SyncStatus, count: number) {
    this.syncStatus = status;
    this.pendingCount = count;
    this.listeners.forEach(l => l(status, count));
  }

  private schedulePoll() {
    if (this.syncInterval) return;
    this.syncInterval = setInterval(async () => {
      if (navigator.onLine) {
        const count = await getPendingSyncCount();
        if (count > 0) this.startSync();
      }
    }, 30_000);
  }

  async startSync() {
    if (this.syncStatus === 'syncing') return;
    const count = await getPendingSyncCount();
    if (count === 0) {
      this.notify('idle', 0);
      return;
    }

    this.notify('syncing', count);

    try {
      await this.syncCollections();
      await this.syncPayments();
      await this.processSyncQueue();

      const remaining = await getPendingSyncCount();
      this.notify(remaining === 0 ? 'synced' : 'error', remaining);
      if (remaining === 0) {
        setTimeout(() => this.notify('idle', 0), 3000);
      }
    } catch {
      const remaining = await getPendingSyncCount();
      this.notify('error', remaining);
    }
  }

  private async syncCollections() {
    const pending = await offlineDb.offlineCollections
      .where('status').equals('pending').toArray();

    for (const col of pending) {
      try {
        await addDoc(collection(db, 'collections'), {
          organizationId: col.orgId,
          agentId: col.agentId,
          customerId: col.customerId,
          customerName: col.customerName,
          amount: col.amount,
          date: col.date,
          notes: col.notes ?? '',
          syncedFromOffline: true,
          createdAt: serverTimestamp(),
        });
        await offlineDb.offlineCollections
          .where('localId').equals(col.localId)
          .modify({ status: 'synced', syncedAt: Date.now() });
      } catch {
        await offlineDb.offlineCollections
          .where('localId').equals(col.localId)
          .modify({ status: 'failed' });
      }
    }
  }

  private async syncPayments() {
    const pending = await offlineDb.pendingPayments
      .where('status').equals('pending').toArray();

    for (const pay of pending) {
      try {
        await addDoc(collection(db, 'transactions'), {
          organizationId: pay.orgId,
          customerId: pay.customerId,
          customerName: pay.customerName,
          amount: pay.amount,
          type: pay.type,
          date: pay.date,
          notes: pay.notes ?? '',
          syncedFromOffline: true,
          createdAt: serverTimestamp(),
        });
        await offlineDb.pendingPayments
          .where('localId').equals(pay.localId)
          .modify({ status: 'synced' });
      } catch {
        await offlineDb.pendingPayments
          .where('localId').equals(pay.localId)
          .modify({ status: 'failed' });
      }
    }
  }

  private async processSyncQueue() {
    const items = await offlineDb.syncQueue
      .where('status').equals('pending').toArray();

    for (const item of items) {
      try {
        if (item.action === 'create') {
          await addDoc(collection(db, item.collection), {
            ...item.payload,
            createdAt: serverTimestamp(),
          });
        }
        if (item.id !== undefined) {
          await offlineDb.syncQueue.update(item.id, { status: 'processing' });
        }
      } catch {
        if (item.id !== undefined) {
          await offlineDb.syncQueue.update(item.id, {
            status: item.retries >= 3 ? 'failed' : 'pending',
            retries: item.retries + 1,
          });
        }
      }
    }
  }
}

export const offlineSyncService = new OfflineSyncService();
