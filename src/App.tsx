import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTransaction,
  exportCsvUrl,
  fetchSummary,
  login,
  type Summary,
  type Transaction,
  updateTransaction,
  voidTransaction
} from "./lib/api";
import {
  cartDescription,
  cartTotal,
  EMPTY_CART,
  ITEM_KEYS,
  NAMES,
  PRICES,
  type CartItems,
  type ItemKey,
  yen
} from "./lib/prices";

type Tab = "register" | "summary";

type CheckoutState = {
  total: number;
  description: string;
} | null;

function todayJst(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function timeLabel(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function App() {
  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState("");
  const [terminalId, setTerminalId] = useState(
    () => localStorage.getItem("terminalId") || "受付A"
  );
  const [tab, setTab] = useState<Tab>("register");
  const [clock, setClock] = useState("--:--");
  const [cart, setCart] = useState<CartItems>(EMPTY_CART);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>(null);
  const [toast, setToast] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [flashKey, setFlashKey] = useState<ItemKey | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const date = todayJst();

  const total = useMemo(() => cartTotal(cart), [cart]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
  }, []);

  const refreshSummary = useCallback(async () => {
    try {
      const next = await fetchSummary(date);
      setSummary(next);
      setAuthed(true);
    } catch (error) {
      if (error instanceof Error && error.message.includes("認証")) {
        setAuthed(false);
        return;
      }
      showToast(error instanceof Error ? error.message : "集計の取得に失敗しました。");
    }
  }, [date, showToast]);

  useEffect(() => {
    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date())
      );
    };
    updateClock();
    const timer = window.setInterval(updateClock, 10000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    void refreshSummary();
  }, [refreshSummary]);

  useEffect(() => {
    if (!authed) return;
    const timer = window.setInterval(() => void refreshSummary(), 4000);
    return () => window.clearInterval(timer);
  }, [authed, refreshSummary]);

  function adjustCart(key: ItemKey, delta: number) {
    setCart((current) => ({
      ...current,
      [key]: Math.max(0, current[key] + delta)
    }));
    if (delta > 0) {
      setFlashKey(key);
      window.setTimeout(() => setFlashKey(null), 250);
    }
  }

  async function handleLogin(event: React.FormEvent) {
    event.preventDefault();
    if (!pin.trim()) return;
    try {
      await login(pin.trim());
      localStorage.setItem("terminalId", terminalId.trim() || "受付");
      setAuthed(true);
      setPin("");
      await refreshSummary();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "ログインに失敗しました。");
    }
  }

  async function checkout() {
    if (total === 0 || submitting) return;
    const items = { ...cart };
    setSubmitting(true);
    try {
      await createTransaction({
        clientRequestId: crypto.randomUUID(),
        terminalId: terminalId.trim() || "受付",
        items
      });
      setCheckoutState({ total, description: cartDescription(items) });
      await refreshSummary();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "会計登録に失敗しました。");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVoid(transaction: Transaction) {
    if (!confirm(`${timeLabel(transaction.createdAt)} の会計を取消しますか？`)) return;
    try {
      await voidTransaction(transaction.id);
      showToast("取消しました");
      await refreshSummary();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "取消に失敗しました。");
    }
  }

  async function handleEditSave(transaction: Transaction, items: CartItems) {
    try {
      await updateTransaction(transaction.id, items);
      setEditingTransaction(null);
      showToast("履歴を修正しました");
      await refreshSummary();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "履歴の修正に失敗しました。");
    }
  }

  if (!authed) {
    return (
      <div className="login-page">
        <form className="login-card" onSubmit={handleLogin}>
          <div className="login-title">入場受付</div>
          <label>
            端末名
            <input
              value={terminalId}
              onChange={(event) => setTerminalId(event.target.value)}
              maxLength={40}
            />
          </label>
          <label>
            共有PIN
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              inputMode="numeric"
              type="password"
              autoFocus
            />
          </label>
          <button type="submit">ログイン</button>
        </form>
        <Toast message={toast} />
      </div>
    );
  }

  return (
    <>
      <header>
        <div className="header-left">入場受付</div>
        <input
          className="terminal-input"
          value={terminalId}
          onChange={(event) => {
            setTerminalId(event.target.value);
            localStorage.setItem("terminalId", event.target.value);
          }}
          aria-label="端末名"
        />
        <div className="header-clock">{clock}</div>
      </header>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === "register" ? "active" : ""}`}
          onClick={() => setTab("register")}
        >
          レジ
        </button>
        <button
          className={`tab-btn ${tab === "summary" ? "active" : ""}`}
          onClick={() => {
            setTab("summary");
            void refreshSummary();
          }}
        >
          集計
        </button>
      </div>

      <main className={`page ${tab === "register" ? "active" : ""}`}>
        <RegisterPage
          cart={cart}
          total={total}
          submitting={submitting}
          flashKey={flashKey}
          onAdjust={adjustCart}
          onClear={() => setCart(EMPTY_CART)}
          onCheckout={() => void checkout()}
        />
      </main>

      <main className={`page ${tab === "summary" ? "active" : ""}`}>
        <SummaryPage
          summary={summary}
          date={date}
          onRefresh={() => void refreshSummary()}
          onVoid={(transaction) => void handleVoid(transaction)}
          onEdit={setEditingTransaction}
        />
      </main>

      <CheckoutOverlay
        state={checkoutState}
        onNext={() => {
          setCheckoutState(null);
          setCart(EMPTY_CART);
          showToast("会計完了");
        }}
      />
      <EditTransactionDialog
        transaction={editingTransaction}
        onClose={() => setEditingTransaction(null)}
        onSave={(transaction, items) => void handleEditSave(transaction, items)}
      />
      <Toast message={toast} />
    </>
  );
}

function RegisterPage(props: {
  cart: CartItems;
  total: number;
  submitting: boolean;
  flashKey: ItemKey | null;
  onAdjust: (key: ItemKey, delta: number) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <>
      <div className="cart-display">
        <div className="cart-rows">
          {ITEM_KEYS.map((key) => (
            <div className="cart-row" key={key}>
              <div className="cart-row-dot" style={{ background: `var(--${key})` }} />
              <div className="cart-row-name">{NAMES[key]}</div>
              <div className="cart-qty-wrap">
                <button className="cart-qty-btn" onClick={() => props.onAdjust(key, -1)}>
                  -
                </button>
                <div className="cart-qty">{props.cart[key]}</div>
                <button className="cart-qty-btn" onClick={() => props.onAdjust(key, 1)}>
                  +
                </button>
              </div>
              <div className="cart-row-sub">
                {key === "free" ? "-" : yen(PRICES[key] * props.cart[key])}
              </div>
            </div>
          ))}
        </div>
        <div className="cart-total-row">
          <div className="cart-total-label">合計金額</div>
          <div className="cart-total-amount">{yen(props.total)}</div>
        </div>
        <div className="cart-action-row">
          <button className="clear-top-btn" onClick={props.onClear}>リセット</button>
          <button
            className={`checkout-top-btn ${props.total > 0 ? "ready" : ""}`}
            onClick={props.onCheckout}
            disabled={props.total === 0 || props.submitting}
          >
            {props.submitting ? "送信中..." : "会計する"}
          </button>
        </div>
      </div>

      <div className="quick-grid">
        {ITEM_KEYS.map((key) => (
          <button
            key={key}
            className={`quick-btn ${key} ${props.flashKey === key ? "flash" : ""}`}
            onClick={() => props.onAdjust(key, 1)}
          >
            <div className="q-name">{NAMES[key]}</div>
            <div className="q-price">{PRICES[key] === 0 ? "無料" : yen(PRICES[key])}</div>
          </button>
        ))}
      </div>
    </>
  );
}

function SummaryPage(props: {
  summary: Summary | null;
  date: string;
  onRefresh: () => void;
  onVoid: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
}) {
  const totals = props.summary?.totals ?? EMPTY_CART;
  const people = props.summary?.people ?? 0;
  const groups = props.summary?.groups ?? 0;
  const totalRevenue = props.summary?.totalRevenue ?? 0;

  return (
    <div className="summary-page">
      <div className="summary-header-row">
        <div>
          <div className="summary-title">本日の集計</div>
          <div className="summary-date">{props.date}</div>
        </div>
        <div className="summary-actions">
          <button className="reset-btn" onClick={props.onRefresh}>更新</button>
          <a className="reset-btn" href={exportCsvUrl(props.date)}>CSV</a>
        </div>
      </div>

      <div className="total-card">
        <div>
          <div className="total-card-label">総売上</div>
          <div className="total-card-value">{yen(totalRevenue)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="total-card-label">組数</div>
          <div className="total-card-people">{groups} 組</div>
        </div>
      </div>

      <div className="sum-section-label">入場者</div>
      <div className="summary-card">
        <SummaryRow itemKey="adult" count={totals.adult} unit="名" />
        <SummaryRow itemKey="child" count={totals.child} unit="名" />
        <SummaryRow itemKey="free" count={totals.free} unit="名" />
        <div className="summary-row sum-total-row-inner">
          <div className="sum-dot invisible" />
          <div className="sum-name muted-small">合計</div>
          <div className="sum-price" />
          <div className="sum-count">{people}</div>
          <div className="sum-unit">名</div>
          <div className="sum-revenue" />
        </div>
      </div>

      <div className="sum-section-label">くじ（別枠）</div>
      <div className="summary-card lottery-card">
        <SummaryRow itemKey="lottery" count={totals.lottery} unit="枚" />
      </div>

      <HourlyBars hourly={props.summary?.hourly ?? {}} />
      <HistoryList
        history={props.summary?.history ?? []}
        onVoid={props.onVoid}
        onEdit={props.onEdit}
      />
    </div>
  );
}

function SummaryRow(props: { itemKey: ItemKey; count: number; unit: string }) {
  const price = PRICES[props.itemKey];
  return (
    <div className="summary-row">
      <div className="sum-dot" style={{ background: `var(--${props.itemKey})` }} />
      <div className="sum-name">{NAMES[props.itemKey]}</div>
      <div className="sum-price">{price === 0 ? "無料" : yen(price)}</div>
      <div className="sum-count">{props.count}</div>
      <div className="sum-unit">{props.unit}</div>
      <div className="sum-revenue">{price === 0 ? "-" : yen(price * props.count)}</div>
    </div>
  );
}

function HourlyBars({ hourly }: { hourly: Record<string, number> }) {
  const now = Number(new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    hour12: false
  }).format(new Date()));
  const start = Math.max(0, now - 4);
  const end = Math.min(23, start + 7);
  const slots = Array.from({ length: end - start + 1 }, (_, index) => start + index);
  const maxVal = Math.max(1, ...slots.map((hour) => hourly[String(hour)] || 0));

  return (
    <div className="hourly-card">
      <div className="hourly-title">時間帯別入場</div>
      <div className="hourly-bars">
        {slots.map((hour) => {
          const val = hourly[String(hour)] || 0;
          const px = Math.round((val / maxVal) * 48) + (val > 0 ? 4 : 2);
          return (
            <div className="h-col" key={hour}>
              <div className={`h-bar ${hour === now ? "current" : ""}`} style={{ height: px }} />
              <div className="h-label">{hour}時</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoryList(props: {
  history: Transaction[];
  onVoid: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
}) {
  return (
    <div className="history-card">
      <div className="history-head">会計履歴</div>
      <div className="history-list">
        {props.history.length === 0 ? (
          <div className="history-empty">まだ会計がありません</div>
        ) : props.history.map((transaction) => {
          const description = cartDescription(transaction);
          return (
            <div className={`history-item ${transaction.voided ? "voided" : ""}`} key={transaction.id}>
              <div className="hi-time">{timeLabel(transaction.createdAt)}</div>
              <div className="hi-dot" />
              <div className="hi-desc">{description || "-"}</div>
              {transaction.editedAt ? <div className="edited-label">修正</div> : null}
              <div className="hi-terminal">{transaction.terminalId}</div>
              <div className="hi-amount">{yen(transaction.amount)}</div>
              {transaction.voided ? (
                <div className="void-label">取消済</div>
              ) : (
                <div className="history-buttons">
                  <button className="edit-btn" onClick={() => props.onEdit(transaction)}>
                    編集
                  </button>
                  <button className="void-btn" onClick={() => props.onVoid(transaction)}>
                    取消
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EditTransactionDialog(props: {
  transaction: Transaction | null;
  onClose: () => void;
  onSave: (transaction: Transaction, items: CartItems) => void;
}) {
  const [items, setItems] = useState<CartItems>(EMPTY_CART);

  useEffect(() => {
    if (!props.transaction) return;
    setItems({
      adult: props.transaction.adult,
      child: props.transaction.child,
      lottery: props.transaction.lottery,
      free: props.transaction.free
    });
  }, [props.transaction]);

  if (!props.transaction) return null;

  const total = cartTotal(items);
  const empty = ITEM_KEYS.every((key) => items[key] === 0);

  function adjust(key: ItemKey, delta: number) {
    setItems((current) => ({
      ...current,
      [key]: Math.max(0, current[key] + delta)
    }));
  }

  return (
    <div className="edit-overlay">
      <div className="edit-dialog">
        <div className="edit-head">
          <div>
            <div className="edit-title">履歴を編集</div>
            <div className="edit-meta">
              {timeLabel(props.transaction.createdAt)} / {props.transaction.terminalId}
            </div>
          </div>
          <button className="edit-close" onClick={props.onClose} aria-label="閉じる">×</button>
        </div>

        <div className="edit-rows">
          {ITEM_KEYS.map((key) => (
            <div className="edit-row" key={key}>
              <div className="cart-row-dot" style={{ background: `var(--${key})` }} />
              <div className="edit-name">{NAMES[key]}</div>
              <button className="cart-qty-btn" onClick={() => adjust(key, -1)}>-</button>
              <div className="cart-qty">{items[key]}</div>
              <button className="cart-qty-btn" onClick={() => adjust(key, 1)}>+</button>
              <div className="edit-sub">{key === "free" ? "-" : yen(PRICES[key] * items[key])}</div>
            </div>
          ))}
        </div>

        <div className="edit-total">
          <span>修正後合計</span>
          <strong>{yen(total)}</strong>
        </div>

        <div className="edit-actions">
          <button className="clear-top-btn" onClick={props.onClose}>キャンセル</button>
          <button
            className="checkout-top-btn ready"
            disabled={empty}
            onClick={() => props.onSave(props.transaction!, items)}
          >
            保存する
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckoutOverlay(props: {
  state: CheckoutState;
  onNext: () => void;
}) {
  return (
    <div className={`checkout-overlay ${props.state ? "show" : ""}`}>
      <div className="co-icon">✓</div>
      <div className="co-change-label">合計金額</div>
      <div className="co-change">{yen(props.state?.total ?? 0)}</div>
      <div className="co-sub">{props.state?.description}</div>
      <button className="co-next-btn" onClick={props.onNext}>次のお客様</button>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return <div className={`toast ${message ? "show" : ""}`}>{message}</div>;
}

export default App;
