import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { errorMessage } from "../../lib/api.ts";
import { categories, equipment, library, type CategoryId } from "../../lib/catalog.ts";
import { chime } from "../../lib/feedback.ts";
import { brlShort, fold, plural } from "../../lib/format.ts";
import { actions, retry, useDB } from "../../lib/store.ts";
import { toast } from "../../lib/toast.ts";
import type { Item } from "../../lib/types.ts";
import { SuccessOverlay } from "../../ui/Celebrate.tsx";
import {
  Button,
  EmptyState,
  FieldRow,
  GlassButton,
  Group,
  Img,
  Row,
  SearchField,
  Segmented,
  SelectRow,
  Spinner,
  Stepper,
  Switch,
  TextAreaBlock,
} from "../../ui/controls.tsx";
import { ImagePicker } from "../../ui/ImagePicker.tsx";
import { Page } from "../../ui/Page.tsx";
import { ActionSheet, Sheet } from "../../ui/Sheet.tsx";
import { ProfileButton } from "../shared/Profile.tsx";

function parseMoney(value: string) {
  const n = Number(value.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function money(value: number) {
  return value ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "";
}

function ItemEditor({ open, item, onClose, onSaved }: { open: boolean; item: Item | null; onClose: () => void; onSaved: (first: boolean) => void }) {
  const storeCategory = useDB().business?.category ?? "ferramentas";
  const [name, setName] = useState("");
  const [category, setCategory] = useState<CategoryId>(storeCategory);
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [description, setDescription] = useState("");
  const [specs, setSpecs] = useState<string[]>([]);
  const [spec, setSpec] = useState("");
  const [image, setImage] = useState("");
  const [available, setAvailable] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCategory(item?.category ?? storeCategory);
    setPrice(money(item?.price ?? 0));
    setDeposit(money(item?.deposit ?? 0));
    setQuantity(item?.quantity ?? 1);
    setDescription(item?.description ?? "");
    setSpecs(item?.specs ?? []);
    setSpec("");
    setImage(item?.image ?? "");
    setAvailable(item?.available ?? true);
  }, [open, item, storeCategory]);

  const priceValue = parseMoney(price);
  const valid = name.trim().length >= 3 && priceValue > 0 && image !== "";

  function pickImage(url: string) {
    setImage(url);
    const preset = Object.values(equipment).find((entry) => entry.image === url);
    if (!preset || item || name.trim()) return;
    setName(preset.name);
    setCategory(preset.category);
    if (!description.trim()) setDescription(preset.description);
    if (!specs.length) setSpecs(preset.specs);
  }

  function addSpec() {
    const value = spec.trim().slice(0, 40);
    if (!value || specs.includes(value)) return;
    setSpecs([...specs, value].slice(0, 6));
    setSpec("");
  }

  async function save() {
    setSaving(true);
    try {
      const { first } = await actions.saveItem({
        id: item?.id,
        name: name.trim(),
        category,
        price: priceValue,
        deposit: parseMoney(deposit),
        description: description.trim(),
        specs,
        image,
        quantity,
        available,
      });
      chime("success");
      if (!first) toast(item ? "Item atualizado" : "Item adicionado ao estoque");
      onClose();
      onSaved(first);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={item ? "Editar item" : "Novo item"} large confirm={{ label: "Salvar item", onClick: () => void save(), disabled: !valid, loading: saving }}>
      <ImagePicker value={image} onChange={pickImage} library={library} kind="item" label="Foto do equipamento" />
      <Group>
        <FieldRow label="Nome" value={name} placeholder="Ex.: Betoneira 400 L" maxLength={80} onChange={(e) => setName(e.target.value)} />
        <SelectRow
          label="Categoria"
          value={category}
          options={categories.map((c) => ({ value: c.id, label: c.label }))}
          onChange={(value) => {
            const next = value as CategoryId;
            setCategory(next);
            if (!image || library.some((l) => l.src === image)) setImage(categories.find((c) => c.id === next)?.image ?? image);
          }}
        />
        <FieldRow label="Preço/dia" prefix="R$" inputMode="decimal" value={price} placeholder="0,00" onChange={(e) => setPrice(e.target.value)} />
        <FieldRow label="Caução" prefix="R$" inputMode="decimal" value={deposit} placeholder="0,00" onChange={(e) => setDeposit(e.target.value)} />
        <Row title="Quantidade" value={`${quantity} un.`} trailing={<Stepper value={quantity} onChange={setQuantity} min={1} max={200} label="quantidade" />} />
      </Group>
      <Group title="Descrição">
        <TextAreaBlock aria-label="Descrição" placeholder="Para que serve, estado de conservação, o que acompanha" value={description} maxLength={240} onChange={(e) => setDescription(e.target.value)} />
      </Group>
      <Group title="Destaques" footer="Ex.: 220 V, com operador, entrega montada.">
        <div className="row-block flex flex-wrap items-center gap-2 px-4 py-3">
          {specs.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 type-footnote font-semibold">
              {s}
              <button
                type="button"
                aria-label={`Remover ${s}`}
                onClick={() => setSpecs(specs.filter((x) => x !== s))}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-muted-foreground active:bg-muted"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            value={spec}
            aria-label="Novo destaque"
            placeholder={specs.length ? "Mais um" : "Adicionar destaque"}
            enterKeyHint="done"
            maxLength={40}
            onChange={(e) => setSpec(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSpec();
              }
            }}
            onBlur={addSpec}
            className="h-8 min-w-[130px] flex-1 bg-transparent type-subhead outline-none placeholder:text-subtle"
          />
        </div>
      </Group>
      <Group
        footer={
          quantity === 1
            ? "Com 1 unidade, só um cliente pode alugar por vez."
            : `Com ${quantity} unidades, até ${quantity} aluguéis podem acontecer nas mesmas datas.`
        }
      >
        <Row title="Disponível para aluguel" trailing={<Switch label="Disponível para aluguel" checked={available} onChange={setAvailable} />} />
      </Group>
      {item ? (
        <Button variant="destructive" className="mt-6" onClick={() => setConfirmDelete(true)}>
          Excluir item
        </Button>
      ) : null}
      <ActionSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Excluir este item?"
        message="Ele sai da loja e da busca na hora. Pedidos antigos continuam no histórico."
        actions={[
          {
            label: "Excluir item",
            destructive: true,
            onClick: () => {
              if (!item) return;
              void actions
                .deleteItem(item.id)
                .then(() => {
                  toast("Item excluído", "info");
                  onClose();
                })
                .catch((error) => toast(errorMessage(error), "error"));
            },
          },
        ]}
      />
    </Sheet>
  );
}

export function Inventory() {
  const db = useDB();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "on" | "off">("all");
  const [editor, setEditor] = useState<{ open: boolean; item: Item | null }>({ open: false, item: null });
  const [firstItem, setFirstItem] = useState(false);
  const own = db.ownItems.flatMap((id) => (db.items[id] ? [db.items[id]] : [])).sort((a, b) => b.createdAt - a.createdAt);
  const status = db.requests["own-items"];
  const q = fold(query.trim());
  const shown = own.filter((i) => (filter === "on" ? i.available : filter === "off" ? !i.available : true)).filter((i) => !q || fold(`${i.name} ${i.description}`).includes(q));

  const openEditor = (item: Item | null) => setEditor({ open: true, item });

  useEffect(() => {
    const addItem = () => setEditor({ open: true, item: null });
    window.addEventListener("obra:add-item", addItem);
    return () => window.removeEventListener("obra:add-item", addItem);
  }, []);

  return (
    <Page
      title="Estoque"
      actions={
        <>
          <GlassButton label="Adicionar item" onClick={() => openEditor(null)}>
            <Plus aria-hidden="true" />
          </GlassButton>
          <ProfileButton />
        </>
      }
    >
      {own.length === 0 ? (
        status === "loading" ? (
          <div className="grid h-60 place-items-center text-muted-foreground">
            <Spinner className="size-7" />
          </div>
        ) : status === "error" ? (
          <EmptyState
            mood="sad"
            title="Não deu para carregar"
            text="Confira a internet e tente de novo."
            action={
              <Button size="md" onClick={() => retry("own-items")}>
                Tentar de novo
              </Button>
            }
          />
        ) : (
          <EmptyState
            mood="wave"
            title="Seu estoque está vazio"
            text="Cadastre o primeiro equipamento e ele aparece para quem está por perto."
            action={<Button onClick={() => openEditor(null)}>Adicionar item</Button>}
          />
        )
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} placeholder="Buscar no estoque" />
          <Segmented
            label="Filtrar estoque"
            className="mt-3"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: `Todos (${own.length})` },
              { value: "on", label: "Disponíveis" },
              { value: "off", label: "Pausados" },
            ]}
          />
          {shown.length ? (
            <Group className="mt-4">
              {shown.map((item) => (
                <div key={item.id} className="row flex w-full items-center pl-3">
                  <div className="row-main flex min-h-[86px] min-w-0 flex-1 items-center gap-3 pr-4">
                    <button
                      type="button"
                      onClick={() => openEditor(item)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      <Img src={item.image} alt="" className={`size-16 shrink-0 rounded-[16px] transition-opacity ${item.available ? "" : "opacity-45"}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate type-headline">{item.name}</span>
                        <span className="mt-0.5 block truncate type-footnote text-muted-foreground">
                          {brlShort(item.price)}/dia · {item.quantity} un. · {plural(item.rentals, "aluguel", "aluguéis")}
                        </span>
                        {!item.available ? <span className="mt-0.5 block type-footnote font-semibold text-warning">Pausado</span> : null}
                      </span>
                    </button>
                    <Switch
                      label={`${item.name} disponível`}
                      checked={item.available}
                      onChange={(value) => {
                        void actions
                          .setItemAvailable(item.id, value)
                          .then(() => toast(value ? "Item disponível para aluguel" : "Item pausado", "info"))
                          .catch((error) => toast(errorMessage(error), "error"));
                      }}
                    />
                  </div>
                </div>
              ))}
            </Group>
          ) : (
            <EmptyState mood="think" title="Nada por aqui" text="Mude o filtro ou a busca." />
          )}
        </>
      )}

      <ItemEditor
        open={editor.open}
        item={editor.item}
        onClose={() => setEditor((current) => ({ ...current, open: false }))}
        onSaved={(first) => {
          if (first) setFirstItem(true);
        }}
      />
      <SuccessOverlay
        open={firstItem}
        title="Primeiro item no ar!"
        message="Ele já aparece para quem está perto da sua loja."
        primary={{ label: "Continuar", onClick: () => setFirstItem(false) }}
      />
    </Page>
  );
}
