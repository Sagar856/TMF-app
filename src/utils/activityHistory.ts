export interface ActivityEntry {
  id: number;
  values: Readonly<Record<string, unknown>>;
  overlay?: number;
}

export function activityValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false;
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([key, value]) => Object.hasOwn(right, key) && Object.is(value, Reflect.get(right, key)));
}

export class ActivityHistory {
  entries: ActivityEntry[] = [{ id: 0, values: {} }];
  current = this.entries[0];
  private nextId = 1;
  private overlays = new Map<number, () => void>();

  change(key: string, value: unknown, replace = false): ActivityEntry {
    if (activityValuesEqual(this.current.values[key], value)) return this.current;
    if (replace) {
      const entry = { ...this.current, values: { ...this.current.values, [key]: value } };
      this.entries[this.entries.indexOf(this.current)] = entry;
      this.current = entry;
      return entry;
    }
    return this.append({ ...this.current.values, [key]: value });
  }

  private append(values: ActivityEntry['values'], overlay?: number): ActivityEntry {
    this.entries = this.entries.slice(0, this.entries.indexOf(this.current) + 1);
    this.current = { id: this.nextId++, values, overlay };
    this.entries.push(this.current);
    return this.current;
  }

  openOverlay(close: () => void): number {
    const id = this.nextId;
    this.overlays.set(id, close);
    this.append(this.current.values, id);
    return id;
  }

  closeOverlay(id: number): void {
    this.overlays.delete(id);
  }

  restore(id: number): boolean {
    const target = this.entries.find(entry => entry.id === id);
    if (!target) return false;
    const targetIndex = this.entries.indexOf(target);
    const currentIndex = this.entries.indexOf(this.current);
    if (targetIndex < currentIndex) {
      for (const entry of this.entries.slice(targetIndex + 1, currentIndex + 1).reverse()) {
        if (entry.overlay === undefined) continue;
        const close = this.overlays.get(entry.overlay);
        this.overlays.delete(entry.overlay);
        close?.();
      }
    }
    this.current = target;
    return true;
  }

  isInactiveOverlay(id: number): boolean {
    const entry = this.entries.find(item => item.id === id);
    return entry?.overlay !== undefined && !this.overlays.has(entry.overlay);
  }

  get canGoBack(): boolean {
    return this.entries.slice(0, this.entries.indexOf(this.current))
      .some(entry => entry.overlay === undefined || this.overlays.has(entry.overlay));
  }

  reset(): void {
    this.overlays.clear();
    this.current = { id: this.nextId++, values: {} };
    this.entries = [this.current];
  }
}

export const activityHistory = new ActivityHistory();
const listeners = new Set<() => void>();
let attached = false;
let batching = false;
const notify = () => listeners.forEach(listener => listener());

export function subscribeActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function push(entry: ActivityEntry): void {
  if (attached) window.history.pushState({ ...window.history.state, minarthActivity: entry.id }, '');
  notify();
}

export function changeActivity(key: string, value: unknown): void {
  const previous = activityHistory.current;
  const entry = activityHistory.change(key, value, batching);
  if (entry === previous) return;
  if (batching) {
    if (attached) window.history.replaceState({ ...window.history.state, minarthActivity: entry.id }, '');
    notify();
  } else {
    push(entry);
    batching = true;
    queueMicrotask(() => { batching = false; });
  }
}

export function registerBackActivity(close: () => void): () => void {
  if (!attached) return () => {};
  batching = false;
  const id = activityHistory.openOverlay(close);
  push(activityHistory.current);
  return () => {
    activityHistory.closeOverlay(id);
    queueMicrotask(() => {
      if (attached && activityHistory.current.overlay === id) window.history.back();
    });
  };
}

export function resetActivityHistory(): void {
  batching = false;
  activityHistory.reset();
  if (attached) window.history.replaceState({ ...window.history.state, minarthActivity: activityHistory.current.id }, '');
  notify();
}

export function attachActivityHistory(): () => void {
  attached = true;
  window.history.replaceState({ ...window.history.state, minarthActivity: activityHistory.current.id }, '');
  const pop = (event: PopStateEvent) => {
    batching = false;
    const id: unknown = event.state?.minarthActivity;
    if (typeof id !== 'number') return;
    if (activityHistory.isInactiveOverlay(id)) {
      window.history.back();
      return;
    }
    if (activityHistory.restore(id)) notify();
  };
  window.addEventListener('popstate', pop);
  return () => {
    attached = false;
    window.removeEventListener('popstate', pop);
  };
}
