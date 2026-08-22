// طابور الكتابة المستمر — يضمن ألا تضيع أي كتابة لو انقطعت الشبكة في الملعب.
// كل عملية تُدفع للطابور (مخزَّن في localStorage) وتُرسل بالترتيب؛ الفاشلة
// تبقى في رأس الطابور وتُعاد المحاولة عند عودة الاتصال أو دوريًا.
//
// السلامة عند الإعادة: كل الأفعال تحمل ids مولّدة في العميل وتُكتب بـ upsert
// (ignoreDuplicates)، فإعادة إرسال طلب نجح ولم تصل استجابته لا تكرر شيئًا.
//
// التمييز بين نوعي الفشل ضروري: انقطاع الشبكة ("offline") يُعاد للأبد حتى لا
// يضيع هدف، أما رفض الخادم ("reject") فيُعاد محاولات محدودة ثم يُسقط العنصر —
// وإلا سدّ عنصرٌ فاسدٌ واحد الطابورَ كله ومنع وصول كل ما بعده.

const QUEUE_KEY = "halaqat-write-queue-v1";
const MAX_QUEUE = 500;
const RETRY_MS = 15000;
/** محاولات رفض الخادم قبل إسقاط العنصر وتحرير الطابور */
const MAX_REJECT_TRIES = 3;

export interface QueuedWrite {
  id: string;
  action: string;
  payload: unknown;
  at: number;
  tries: number;
}

/** ok = نجح · offline = تعذّر الوصول (يُعاد للأبد) · reject = رفضه الخادم */
export type WriteResult = "ok" | "offline" | "reject";

type Sender = (action: string, payload: unknown) => Promise<WriteResult>;
type Listener = (pending: number) => void;
/** يُستدعى عند إسقاط عملية نهائيًا — لإظهار تحذير للمستخدم */
type DropHandler = (item: QueuedWrite) => void;

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
let onDrop: DropHandler | null = null;
let flushing = false;
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();
let seq = 0;
/** عمليات أُسقطت بعد فشل متكرر — تظهر للمستخدم كتحذير */
let dropped = 0;

export function droppedWrites(): number {
  return dropped;
}

function notify(): void {
  for (const l of listeners) l(queue.length);
}

/** تشغيل الطابور: يستأنف ما تبقى من جلسة سابقة ويبدأ إعادة المحاولة الدورية */
export function startQueue(send: Sender, dropHandler?: DropHandler): () => void {
  sender = send;
  onDrop = dropHandler ?? null;
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
    onDrop = null;
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
  const item: QueuedWrite = {
    id: `${Date.now().toString(36)}-${seq}`,
    action,
    payload,
    at: Date.now(),
    tries: 0,
  };
  if (queue.length >= MAX_QUEUE) {
    // امتلاء الطابور يعني انقطاعًا طويلًا جدًا — نُسقط الأقدم ونُعلن عنه
    // بدلًا من ابتلاعه صامتًا (الأقدم غالبًا وصل بالفعل أو فقد قيمته)
    const [oldest, ...rest] = queue;
    queue = rest;
    dropped += 1;
    console.error("طابور الكتابة ممتلئ — أُسقطت أقدم عملية:", oldest?.action);
    onDrop?.(oldest);
  }
  queue = [...queue, item];
  saveQueue(queue);
  notify();
  void flushQueue();
}

/**
 * إرسال الطابور بالترتيب. انقطاع الشبكة يوقف الدورة ويُبقي العنصر في رأسها
 * (حفاظًا على ترتيب الأحداث)، أما رفض الخادم المتكرر فيُسقط العنصر بعد
 * MAX_REJECT_TRIES حتى لا يسدّ ما بعده.
 */
export async function flushQueue(): Promise<void> {
  if (flushing || !sender) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  flushing = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      const result = await sender(item.action, item.payload);

      if (result === "ok") {
        queue = queue.slice(1);
        saveQueue(queue);
        notify();
        continue;
      }

      if (result === "offline") {
        // الشبكة غائبة — نُبقي كل شيء كما هو ونعيد المحاولة لاحقًا
        queue = [{ ...item, tries: item.tries + 1 }, ...queue.slice(1)];
        saveQueue(queue);
        notify();
        return;
      }

      // reject: الخادم وصله الطلب ورفضه
      const tries = item.tries + 1;
      if (tries >= MAX_REJECT_TRIES) {
        queue = queue.slice(1);
        dropped += 1;
        saveQueue(queue);
        notify();
        console.error(
          `أُسقطت عملية بعد ${tries} محاولات مرفوضة — لا تسدّ باقي الطابور:`,
          item.action,
          item.payload,
        );
        onDrop?.(item);
        continue; // نكمل الطابور بدل أن نتوقف
      }
      queue = [{ ...item, tries }, ...queue.slice(1)];
      saveQueue(queue);
      notify();
      return;
    }
  } finally {
    flushing = false;
  }
}
