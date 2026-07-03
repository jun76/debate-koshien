import { useCallback, useEffect, useRef, useState } from "react";

export interface CutInMsg {
  title: string;
  sub?: string;
  tone: "aff" | "neg" | "neutral" | "gold";
}

const CUTIN_MS = 1900;

interface CutInQueueItem {
  msg: CutInMsg;
  resolve: () => void;
}

/** Cut-in queue management. Shows one at a time in push order and resolves a Promise when done. */
export function useCutIns() {
  const [current, setCurrent] = useState<CutInMsg | null>(null);
  const queue = useRef<CutInQueueItem[]>([]);
  const busy = useRef(false);

  const pump = useCallback(() => {
    if (busy.current) return;
    const next = queue.current.shift();
    if (!next) return;
    busy.current = true;
    setCurrent(next.msg);
    setTimeout(() => {
      setCurrent(null);
      busy.current = false;
      next.resolve();
      setTimeout(pump, 150);
    }, CUTIN_MS);
  }, []);

  const push = useCallback(
    (msg: CutInMsg) => {
      return new Promise<void>((resolve) => {
        queue.current.push({ msg, resolve });
        pump();
      });
    },
    [pump],
  );

  return { current, push };
}

export function CutInOverlay({ msg }: { msg: CutInMsg | null }) {
  const [visible, setVisible] = useState<CutInMsg | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (msg) {
      setVisible(msg);
      setLeaving(false);
      const t = setTimeout(() => setLeaving(true), CUTIN_MS - 420);
      return () => clearTimeout(t);
    }
    setVisible(null);
    return undefined;
  }, [msg]);

  if (!visible) return null;
  return (
    <div className={`cutin-overlay ${leaving ? "leaving" : ""}`}>
      <div className={`cutin-band tone-${visible.tone}`}>
        <div className="cutin-stripe" />
        <div className="cutin-body">
          <div className="cutin-title">{visible.title}</div>
          {visible.sub && <div className="cutin-sub">{visible.sub}</div>}
        </div>
        <div className="cutin-stripe" />
      </div>
    </div>
  );
}
