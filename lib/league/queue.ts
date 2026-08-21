// طابور الكتابة المستمر — يضمن ألا تضيع أي كتابة لو انقطعت الشبكة في الملعب.
// كل عملية تُدفع للطابور (مخزَّن في localStorage) وتُرسل بالترتيب؛ الفاشلة
// تبقى في رأس الطابور وتُعاد المحاولة عند عودة الاتصال أو دوريًا.
//
// السلامة عند إعادة المحاولة: أفعال الأحداث تحمل ids مولّدة في العميل
// (insert بمعرّف ثابت، upsert للتقارير/الكروت) فإعادة الإرسال لا تكرر شيئًا.
// الوحيد غير المتماثل هو like_post وinsert_audit — وتكرارهما غير مؤذٍ عمليًا.

const QUEUE_KEY = "halaqat-write-queue-v1";
const MAX_QUEUE = 500;
const RETRY_MS = 15000;

export interface QueuedWrite {
  id: string;
  action: string;
  payload: unknown;
  at: number;
  tries: number;
}

type Sender = (action: string, payload: unknown) => Promise<boolean>;
type Listener = (pending: number) => void;

function loadQueue(): QueuedWrite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedWrite[]) : [];
  } catch {
    return [];
  }
}

function saveQueue(q: QueuedWrite[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    // التخزين ممتلئ — نُبقي ما في الذاكرة
  }
}

let queue: QueuedWrite[] = [];
let sender: Sender | null = null;
let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();
let seq = 0;

function notify(): void {
  for (const l of listeners) l(queue.length);
}

/** تشغيل الطابور: يستأنف ما تبقى من جلسة سابقة ويبدأ إعادة المحاولة الدورية */
export function startQueue(send: Sender): () => void {
  sender = send;
  queue = loadQueue();
  notify();
  void flushQueue();

  const onOnline = () => void flushQueue();
  window.addEventListener("online", onOnline);
  timer = setInterval(() => void flushQueue(), RETRY_MS);

  return () => {
    window.removeEventListener("online", onOnline);
    if (timer) clearInterval(timer);
    timer = null;
    sender = null;
  };
}

export function subscribeQueue(l: Listener): () => void {
  listeners.add(l);
  l(queue.length);
  return () => {
    listeners.delete(l);
  };
}

export function pendingWrites(): number {
  return queue.length;
}

/** إضافة عملية للطابور ومحاولة إرسالها فورًا */
export function enqueueWrite(action: string, payload: unknown): void {
  seq += 1;
  queue = [
    ...queue,
    { id: `${Date.now().toString(36)}-${seq}`, action, payload, at: Date.now(), tries: 0 },
  ].slice(-MAX_QUEUE);
  saveQueue(queue);
  notify();
  void flushQueue();
}

/** إرسال الطابور بالترتيب — يتوقف عند أول فشل ليحافظ على ترتيب الأحداث */
export async function flushQueue(): Promise<void> {
  if (flushing || !sender) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      const ok = await sender(item.action, item.payload);
      if (!ok) {
        queue = [{ ...item, tries: item.tries + 1 }, ...queue.slice(1)];
        saveQueue(queue);
        notify();
        return; // نحافظ على الترتيب: لا نتخطى عملية فاشلة
      }
      queue = queue.slice(1);
      saveQueue(queue);
      notify();
    }
  } finally {
    flushing = false;
  }
}
