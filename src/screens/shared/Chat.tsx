import { useEffect, useId, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { clock, dateLabel, isoDay } from "../../lib/format.ts";
import { actions, setViewingChat, useDB, useMe, useRequest } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import { Avatar, BizLogo, EmptyState, Img, Spinner } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";

export function ChatScreen({ orderId }: { orderId: string }) {
  const db = useDB();
  const me = useMe();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const order = db.orders[orderId];
  const status = useRequest(`messages:${orderId}`, () => actions.loadMessages(orderId));
  const messages = db.messages[orderId] ?? [];

  useEffect(() => {
    setViewingChat(orderId);
    return () => setViewingChat(null);
  }, [orderId]);

  useEffect(() => {
    void actions.markRead(orderId);
  }, [orderId, messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  if (!order) {
    return (
      <Page title="Mensagens">
        <EmptyState mood="sad" title="Conversa não encontrada" />
      </Page>
    );
  }

  const counterpart = me.role === "customer" ? order.business.name : order.customer.name;

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText("");
    try {
      await actions.sendMessage(orderId, body);
    } catch (error) {
      setText(body);
      toast(errorMessage(error), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <Page
      title={counterpart}
      largeTitle={false}
      scrollRef={scrollRef}
      bottomBar={
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
          className="glass flex items-end gap-2 rounded-[26px] p-1.5 pl-4"
        >
          <label htmlFor={inputId} className="sr-only">
            Mensagem
          </label>
          <textarea
            id={inputId}
            rows={1}
            value={text}
            maxLength={2000}
            placeholder="Mensagem"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-28 min-h-[40px] flex-1 resize-none bg-transparent py-2 type-body outline-none [field-sizing:content] placeholder:text-subtle"
          />
          <button
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!text.trim() || sending}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-subtle"
          >
            <ArrowUp className="size-5" strokeWidth={2.6} aria-hidden="true" />
          </button>
        </form>
      }
    >
      <div className="flex flex-col items-center pt-2 pb-5 text-center">
        {me.role === "customer" ? (
          <BizLogo business={{ name: order.business.name, logo: order.business.logo }} size={64} />
        ) : (
          <Avatar name={counterpart} src={order.customer.photo} size={64} />
        )}
        <p className="mt-2 type-headline">{counterpart}</p>
        <div className="mt-3 flex items-center gap-2 rounded-full bg-card py-1.5 pr-3.5 pl-1.5 elev-1">
          <Img src={order.item.image} alt="" className="size-7 rounded-full" />
          <span className="type-footnote font-semibold">
            Pedido {order.code} · {order.item.name}
          </span>
        </div>
      </div>

      {status === "loading" && messages.length === 0 ? (
        <div className="grid h-24 place-items-center text-muted-foreground">
          <Spinner />
        </div>
      ) : null}

      <ol className="flex flex-col gap-1.5" aria-live="polite">
        {messages.map((message, index) => {
          const mine = message.from === me.role;
          const previous = messages[index - 1];
          const showTime = !previous || message.at - previous.at > 15 * 60_000;
          return (
            <li key={message.id} className="flex flex-col">
              {showTime ? (
                <span className="my-2 self-center type-caption text-muted-foreground">
                  {dateLabel(isoDay(new Date(message.at)))} · {clock(message.at)}
                </span>
              ) : null}
              <span
                className={`anim-pop max-w-[78%] px-3.5 py-2 type-body break-words whitespace-pre-wrap ${
                  mine ? "self-end rounded-[20px] rounded-br-[6px] bg-primary text-primary-foreground" : "self-start rounded-[20px] rounded-bl-[6px] bg-bubble text-foreground"
                }`}
              >
                {message.text}
              </span>
            </li>
          );
        })}
      </ol>
      {status !== "loading" && messages.length === 0 ? (
        <p className="mt-6 text-center type-subhead text-muted-foreground">Mande a primeira mensagem sobre este pedido.</p>
      ) : null}
    </Page>
  );
}
