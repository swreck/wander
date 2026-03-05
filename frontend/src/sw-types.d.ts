// Type declarations for Service Worker APIs not yet in standard TypeScript libs

interface SyncEvent extends ExtendableEvent {
  readonly tag: string;
}

interface SyncManager {
  register(tag: string): Promise<void>;
}

interface ServiceWorkerRegistration {
  readonly sync: SyncManager;
}

declare interface ServiceWorkerGlobalScopeEventMap {
  sync: SyncEvent;
}
