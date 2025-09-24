import localforage from "localforage";

// Ensure a stable store; if already configured elsewhere, this is idempotent
localforage.config({ name: "accounting-app", storeName: "state" });

export type QueuedRequest = {
  id: string;
  url: string;
  method: "POST" | "PUT" | "DELETE";
  headers: Record<string, string>;
  body: any;
  createdAt: number;
  retryCount: number;
};

const QUEUE_KEY = "offline_queue_v1";
const CACHE_PREFIX = "offline_cache_v1:";

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

function getTokenForCache(): string | null {
  try {
    return localStorage.getItem("auth_token");
  } catch {
    return null;
  }
}

export function cacheKeyFor(url: string): string {
  const token = getTokenForCache();
  return `${CACHE_PREFIX}GET:${url}:t=${token ? token.slice(0, 16) : "anon"}`;
}

export async function getCached<T>(key: string): Promise<T | null> {
  const v = await localforage.getItem<{ ts: number; data: T }>(key);
  return v ? v.data : null;
}

export async function setCached<T>(key: string, data: T): Promise<void> {
  await localforage.setItem(key, { ts: Date.now(), data });
}

async function loadQueue(): Promise<QueuedRequest[]> {
  const q = await localforage.getItem<QueuedRequest[]>(QUEUE_KEY);
  return q ?? [];
}

async function saveQueue(q: QueuedRequest[]): Promise<void> {
  await localforage.setItem(QUEUE_KEY, q);
}

export async function enqueue(
  req: Omit<QueuedRequest, "id" | "createdAt" | "retryCount">,
) {
  const q = await loadQueue();
  const item: QueuedRequest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: Date.now(),
    retryCount: 0,
    ...req,
  };
  q.push(item);
  await saveQueue(q);
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function processQueue(): Promise<{
  processed: number;
  failed: number;
  remaining: number;
}> {
  if (!isOnline()) return { processed: 0, failed: 0, remaining: 0 };
  
  let q = await loadQueue();
  if (!q.length) return { processed: 0, failed: 0, remaining: 0 };

  const remaining: QueuedRequest[] = [];
  let processed = 0;
  let failed = 0;
  
  // Process in batches of 3 for better performance
  const batchSize = 3;
  const batches = [];
  
  for (let i = 0; i < q.length; i += batchSize) {
    batches.push(q.slice(i, i + batchSize));
  }
  
  for (const batch of batches) {
    const batchPromises = batch.map(async (item) => {
      try {
        // Add exponential backoff based on retry count
        const backoffTime = item.retryCount > 0 ? Math.min(1000 * Math.pow(2, item.retryCount - 1), 30000) : 0;
        if (backoffTime > 0) {
          await wait(backoffTime);
        }
        
        const res = await fetch(item.url, {
          method: item.method,
          headers: { 
            "Content-Type": "application/json", 
            ...item.headers,
            "X-Offline-Sync": "true" // Flag for server to identify offline syncs
          },
          body: item.body != null ? JSON.stringify(item.body) : undefined,
        });
        
        if (!res.ok) {
          // Drop non-retryable 4xx errors to avoid blocking the queue
          if (res.status >= 400 && res.status < 500) {
            failed++;
            return null; // Skip this item
          }
          // Retryable
          item.retryCount += 1;
          if (item.retryCount <= 5) {
            return item; // Keep for retry
          } else {
            failed++;
            return null; // Too many retries, drop it
          }
        } else {
          processed++;
          
          // Invalidate related caches based on URL patterns
          const urlPath = new URL(item.url, window.location.origin).pathname;
          
          // Clear all caches related to the resource type
          const resourceType = urlPath.split('/').filter(Boolean)[1]; // e.g., "users", "transactions"
          if (resourceType) {
            const cacheKeys = await localforage.keys();
            for (const key of cacheKeys) {
              if (key.includes(resourceType) && key.startsWith(CACHE_PREFIX)) {
                await localforage.removeItem(key);
              }
            }
          }
          
          return null; // Successfully processed
        }
      } catch (error) {
        // Network failure -> keep for retry with backoff
        item.retryCount += 1;
        if (item.retryCount <= 5) {
          return item; // Keep for retry
        } else {
          failed++;
          return null; // Too many retries, drop it
        }
      }
    });
    
    // Process batch and collect remaining items
    const results = await Promise.all(batchPromises);
    remaining.push(...results.filter(Boolean) as QueuedRequest[]);
  }
  
  // Save the updated queue
  await saveQueue(remaining);
  
  return {
    processed,
    failed,
    remaining: remaining.length
  };
}

// Add a listener for online status changes to automatically process queue
export function setupOfflineSync() {
  let syncInProgress = false;
  
  async function attemptSync() {
    if (syncInProgress || !isOnline()) return;
    
    try {
      syncInProgress = true;
      await processQueue();
    } finally {
      syncInProgress = false;
    }
  }
  
  // Process queue when coming back online
  window.addEventListener('online', attemptSync);
  
  // Also set up periodic sync when online
  const intervalId = setInterval(() => {
    if (isOnline()) attemptSync();
  }, 60000); // Check every minute
  
  return () => {
    window.removeEventListener('online', attemptSync);
    clearInterval(intervalId);
  };
}

let started = false;
let cleanup: (() => void) | null = null;

export function startOfflineSync() {
  if (started) return;
  started = true;
  
  // Initial queue processing
  processQueue();
  
  // Set up automatic sync
  cleanup = setupOfflineSync();
}

export function stopOfflineSync() {
  if (!started) return;
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  started = false;
}
