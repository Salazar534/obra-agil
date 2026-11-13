import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
} from "react";
import { ChevronDown, ChevronRight, CircleX, LoaderCircle, Minus, Plus, Search, Star, type LucideIcon } from "lucide-react";
import { initials } from "../lib/format.ts";
import { statusText } from "../lib/store.ts";
import type { Business, Order, OrderStatus, Role } from "../lib/types.ts";
import { Mascot, type MascotMood } from "./Mascot.tsx";

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <LoaderCircle className={`animate-spin ${className}`} aria-hidden="true" />;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "tinted" | "gray" | "plain" | "destructive" | "glass";
  size?: "lg" | "md" | "sm";
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
};

const buttonSizes = {
  lg: "h-[52px] w-full px-6 type-headline",
  md: "h-11 px-5 type-headline",
  sm: "h-8 px-3.5 type-subhead font-semibold",
};

const buttonVariants = {
  primary: "bg-primary text-primary-foreground disabled:bg-muted disabled:text-subtle",
  tinted: "bg-tint text-primary disabled:opacity-50",
  gray: "bg-muted text-foreground disabled:opacity-50",
  plain: "text-primary disabled:text-subtle",
  destructive: "bg-destructive/10 text-destructive disabled:opacity-50",
  glass: "glass text-foreground",
};

export function Button({
  variant = "primary",
  size = "lg",
  loading = false,
  className = "",
  children,
  ref,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-busy={loading || undefined}
      onClick={loading ? undefined : onClick}
      className={`inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-2 rounded-full transition-[transform,background-color,color,opacity] duration-200 active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${buttonSizes[size]} ${buttonVariants[variant]} ${className}`}
      {...rest}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

export function GlassButton({
  label,
  children,
  onClick,
  className = "",
  pressed,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      className={`glass grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [&_svg]:size-[21px] ${className}`}
    >
      {children}
    </button>
  );
}

const toneBg = {
  blue: "bg-[var(--tone-blue)]",
  orange: "bg-[var(--tone-orange)]",
  green: "bg-[var(--tone-green)]",
  pink: "bg-[var(--tone-pink)]",
  indigo: "bg-[var(--tone-indigo)]",
  gray: "bg-[var(--tone-gray)]",
  teal: "bg-[var(--tone-teal)]",
} as const;

export type Tone = keyof typeof toneBg;

export function ToneIcon({ icon: Icon, tone = "blue", size = 30 }: { icon: LucideIcon; tone?: Tone; size?: number }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-[8px] text-white ${toneBg[tone]}`}
      style={{ width: size, height: size, borderRadius: size * 0.27 }}
    >
      <Icon style={{ width: size * 0.6, height: size * 0.6 }} strokeWidth={2.2} aria-hidden="true" />
    </span>
  );
}

export function Group({
  title,
  footer,
  children,
  className = "",
}: {
  title?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-6 ${className}`}>
      {title ? <h2 className="px-4 pb-2 type-subhead font-semibold text-muted-foreground">{title}</h2> : null}
      <div className="ios-group overflow-hidden rounded-[22px] bg-card">{children}</div>
      {footer ? <p className="px-4 pt-2 type-footnote text-muted-foreground">{footer}</p> : null}
    </section>
  );
}

type RowProps = {
  icon?: LucideIcon;
  tone?: Tone;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  destructive?: boolean;
  center?: boolean;
  label?: string;
};

export function Row({ icon, tone = "blue", leading, title, subtitle, value, chevron, trailing, onClick, href, destructive, center, label }: RowProps) {
  const lead = leading ?? (icon ? <span className="mr-3">{<ToneIcon icon={icon} tone={tone} />}</span> : null);
  const inner = (
    <>
      {lead}
      <span className="row-main flex min-h-[48px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-4">
        <span className={`min-w-0 flex-1 ${center ? "text-center" : ""}`}>
          <span className={`block truncate type-body ${destructive ? "text-destructive" : center ? "text-primary" : ""}`}>{title}</span>
          {subtitle ? <span className="mt-0.5 block truncate type-footnote text-muted-foreground">{subtitle}</span> : null}
        </span>
        {value !== undefined && value !== null && value !== "" ? (
          <span className="max-w-[55%] shrink-0 truncate type-body text-muted-foreground">{value}</span>
        ) : null}
        {trailing}
        {chevron ? <ChevronRight className="size-[18px] shrink-0 text-subtle" strokeWidth={2.4} aria-hidden="true" /> : null}
      </span>
    </>
  );
  const base = "row flex w-full items-center pl-4 text-left";
  const interactive =
    "cursor-pointer transition-colors duration-150 active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary";
  if (href) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" aria-label={label} className={`${base} ${interactive}`}>
        {inner}
      </a>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-label={label} className={`${base} ${interactive}`}>
        {inner}
      </button>
    );
  }
  return <div className={base}>{inner}</div>;
}

export function FieldRow({
  label,
  prefix,
  invalid,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; prefix?: string; invalid?: boolean }) {
  return (
    <label className="row flex w-full items-center pl-4">
      <span className="row-main flex min-h-[48px] min-w-0 flex-1 items-center gap-2 pr-4">
        <span className="w-[108px] shrink-0 type-body">{label}</span>
        {prefix ? <span className="type-body text-muted-foreground">{prefix}</span> : null}
        <input
          {...input}
          aria-invalid={invalid || undefined}
          className={`h-[48px] min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-subtle ${invalid ? "text-destructive" : ""}`}
        />
      </span>
    </label>
  );
}

export function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="row flex w-full items-center pl-4">
      <span className="row-main flex min-h-[48px] min-w-0 flex-1 items-center gap-2 pr-4">
        <span className="w-[108px] shrink-0 type-body">{label}</span>
        <span className="relative flex min-w-0 flex-1 items-center">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-[48px] w-full min-w-0 cursor-pointer appearance-none bg-transparent pr-6 type-body text-foreground outline-none"
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 size-4 text-subtle" aria-hidden="true" />
        </span>
      </span>
    </label>
  );
}

export function TextAreaBlock(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="row-block px-4 py-3">
      <textarea
        {...props}
        className="block min-h-[96px] w-full resize-none bg-transparent type-body outline-none placeholder:text-subtle"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
  label,
}: {
  options: { value: T; label: string; badge?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  label: string;
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div role="tablist" aria-label={label} className={`relative flex h-9 rounded-full bg-muted p-[3px] ${className}`}>
      <span
        aria-hidden="true"
        className="absolute top-[3px] bottom-[3px] left-[3px] rounded-full bg-card shadow-[0_3px_8px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] transition-transform duration-500"
        style={{
          width: `calc((100% - 6px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
          transitionTimingFunction: "var(--ease-spring)",
        }}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={`relative z-10 flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2 type-subhead transition-colors focus-visible:outline-2 focus-visible:outline-primary ${
              selected ? "font-semibold text-foreground" : "text-muted-foreground"
            }`}
          >
            <span className="truncate">{option.label}</span>
            {option.badge ? (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-badge px-1 type-caption font-semibold text-white">
                {option.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        checked ? "bg-switch" : "bg-[rgb(120_120_128/0.18)]"
      }`}
    >
      <span
        className="absolute top-[2px] left-[2px] size-[27px] rounded-full bg-card shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-transform duration-500"
        style={{ transform: checked ? "translateX(20px)" : "none", transitionTimingFunction: "var(--ease-spring)" }}
      />
    </button>
  );
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex h-8 shrink-0 items-center overflow-hidden rounded-[9px] bg-muted">
      <button
        type="button"
        aria-label={`Diminuir ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="grid h-full w-11 cursor-pointer place-items-center active:bg-muted disabled:cursor-not-allowed disabled:text-subtle"
      >
        <Minus className="size-4" strokeWidth={2.6} aria-hidden="true" />
      </button>
      <span className="h-4 w-px bg-border" aria-hidden="true" />
      <button
        type="button"
        aria-label={`Aumentar ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className="grid h-full w-11 cursor-pointer place-items-center active:bg-muted disabled:cursor-not-allowed disabled:text-subtle"
      >
        <Plus className="size-4" strokeWidth={2.6} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Chip({ selected, children, onClick }: { selected?: boolean; children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-4 type-subhead font-semibold transition-[background-color,color,transform] duration-200 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
        selected ? "bg-primary text-primary-foreground" : "bg-card text-foreground elev-1"
      }`}
    >
      {children}
    </button>
  );
}

const statusTone: Record<OrderStatus, string> = {
  awaiting_payment: "bg-warning/12 text-warning",
  pending: "bg-warning/12 text-warning",
  accepted: "bg-tint text-primary",
  on_the_way: "bg-info/12 text-info",
  delivered: "bg-success/12 text-success",
  returned: "bg-muted text-muted-foreground",
  declined: "bg-destructive/10 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusPill({ order, role = "customer" }: { order: Pick<Order, "status" | "mode">; role?: Role }) {
  return (
    <span className={`inline-flex h-6 shrink-0 items-center rounded-full px-2.5 type-footnote font-semibold ${statusTone[order.status]}`}>
      {statusText(order, role)}
    </span>
  );
}

export function Rating({ value, count, className = "" }: { value: number; count?: number; className?: string }) {
  if (!value) return <span className={`font-semibold text-primary ${className}`}>Novo</span>;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Star className="size-[0.9em] fill-star text-star" aria-hidden="true" />
      <span className="font-semibold text-foreground">{value.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</span>
      {count !== undefined ? <span className="text-muted-foreground">({count})</span> : null}
    </span>
  );
}

export function StarInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Nota" className="flex justify-center gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? "estrela" : "estrelas"}`}
          onClick={() => onChange(n)}
          className="cursor-pointer rounded-full p-1 transition-transform duration-200 active:scale-90 focus-visible:outline-2 focus-visible:outline-primary"
        >
          <Star
            key={`${n}-${value >= n}`}
            className={`size-10 ${value >= n ? "anim-pop fill-star text-star" : "text-border"}`}
            strokeWidth={1.6}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

const avatarTones = [
  "bg-[var(--tone-blue)]",
  "bg-[var(--tone-orange)]",
  "bg-[var(--tone-green)]",
  "bg-[var(--tone-pink)]",
  "bg-[var(--tone-indigo)]",
  "bg-[var(--tone-teal)]",
];

function hash(text: string) {
  let h = 0;
  for (const char of text) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

export function Avatar({
  name,
  src,
  size = 40,
  square = false,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  square?: boolean;
  className?: string;
}) {
  const radius = square ? size * 0.28 : size;
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className={`shrink-0 object-cover ${className}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-semibold text-white ${avatarTones[hash(name) % avatarTones.length]} ${className}`}
      style={{ width: size, height: size, borderRadius: radius, fontSize: Math.round(size * 0.38) }}
    >
      {initials(name)}
    </span>
  );
}

export function BizLogo({ business, size = 44, className = "" }: { business: Pick<Business, "name" | "logo">; size?: number; className?: string }) {
  return <Avatar name={business.name} src={business.logo} size={size} square className={className} />;
}

export function SearchField({
  value,
  onChange,
  placeholder,
  autoFocus,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit?.();
      }}
      className="flex h-11 items-center gap-2 rounded-full bg-card px-4 elev-1 focus-within:ring-2 focus-within:ring-primary"
    >
      <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-subtle [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button type="button" aria-label="Limpar busca" onClick={() => onChange("")} className="grid size-7 cursor-pointer place-items-center">
          <CircleX className="size-[18px] fill-subtle text-card" aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}

export function Field({
  label,
  hint,
  error,
  adornment,
  trailing,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; adornment?: ReactNode; trailing?: ReactNode }) {
  const id = useId();
  const messageId = `${id}-msg`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block px-1 type-footnote font-semibold text-muted-foreground">
        {label}
      </label>
      <div
        className={`flex h-[54px] items-center gap-2 rounded-[18px] bg-card px-4 elev-1 ring-2 transition-shadow duration-200 ${
          error ? "anim-shake ring-destructive" : "ring-transparent focus-within:ring-primary"
        }`}
      >
        {adornment}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? messageId : undefined}
          {...input}
          className="h-full min-w-0 flex-1 bg-transparent type-body outline-none placeholder:text-subtle"
        />
        {trailing}
      </div>
      {error || hint ? (
        <p id={messageId} role={error ? "alert" : undefined} className={`mt-1.5 px-1 type-footnote ${error ? "text-destructive" : "text-muted-foreground"}`}>
          {error || hint}
        </p>
      ) : null}
    </div>
  );
}

export function Img({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={`relative block overflow-hidden ${loaded ? "bg-card" : "shimmer"} ${className}`}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0 && !loaded) setLoaded(true);
        }}
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </span>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="mt-8 mb-3 flex items-baseline justify-between gap-3">
      <h2 className="type-title3">{title}</h2>
      {action ? (
        <button type="button" onClick={action.onClick} className="cursor-pointer rounded-md type-body text-primary focus-visible:outline-2 focus-visible:outline-primary">
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({
  mood = "think",
  title,
  text,
  action,
}: {
  mood?: MascotMood;
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="anim-rise flex flex-col items-center px-6 py-8 text-center">
      <Mascot mood={mood} size={124} />
      <h2 className="mt-4 type-title3">{title}</h2>
      {text ? <p className="mt-1.5 max-w-[270px] type-subhead text-muted-foreground">{text}</p> : null}
      {action ? <div className="mt-5 flex w-full max-w-[260px] justify-center">{action}</div> : null}
    </div>
  );
}
