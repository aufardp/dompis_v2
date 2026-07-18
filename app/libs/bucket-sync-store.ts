const MODULE_ID = Math.random().toString(36).slice(2);
console.log('[STORE] module initialized, ID:', MODULE_ID);

type Listener = (state: Record<string, number>) => void;

let state: Record<string, number> = {};
const listeners = new Set<Listener>();

export function getSnapshot(): Record<string, number> {
  return state;
}

export function setBucketCount(key: string, count: number) {
  console.log('[STORE] setBucketCount called:', key, count);
  state = { ...state, [key]: count };
  console.log('[STORE] state after set:', state);
  listeners.forEach(fn => fn(state));
}

export function subscribe(listener: Listener): () => void {
  console.log('[STORE] subscribe called, total listeners:', listeners.size + 1);
  listeners.add(listener);
  return () => {
    console.log('[STORE] unsubscribe called');
    listeners.delete(listener);
  };
}
