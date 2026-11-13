import { useEffect, useState } from "react";
import { categories, categoryLabel, type CategoryId } from "../../lib/catalog.ts";
import { useNav } from "../../lib/nav.tsx";
import { actions, originOf, useDB, useMe, type Listing } from "../../lib/store.ts";
import { ListingRow } from "../../ui/cards.tsx";
import { Button, Chip, EmptyState, Group, SearchField, Segmented } from "../../ui/controls.tsx";
import { Page } from "../../ui/Page.tsx";

type Sort = "near" | "price" | "rating";

export function SearchScreen({ category }: { category?: CategoryId }) {
  const db = useDB();
  const me = useMe();
  const nav = useNav();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CategoryId | "all">(category ?? "all");
  const [sort, setSort] = useState<Sort>("near");
  const [results, setResults] = useState<Listing[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const origin = originOf(db, me);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(
      async () => {
        try {
          const found = await actions.search(origin, { q: query, category: selected === "all" ? undefined : selected, sort }, controller.signal);
          if (controller.signal.aborted) return;
          setResults(found.sort((a, b) => Number(b.item.available) - Number(a.item.available)));
          setFailed(false);
        } catch {
          if (!controller.signal.aborted) setFailed(true);
        }
      },
      query ? 300 : 0,
    );
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, selected, sort, origin.lat, origin.lng, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const browsing = !query.trim() && selected === "all";
  const title = category ? categoryLabel(category) : "Buscar";
  const remember = () => {
    if (query.trim()) void actions.addRecent(query).catch(() => {});
  };

  return (
    <Page title={title}>
      <SearchField value={query} onChange={setQuery} placeholder="Betoneira, andaime, gerador…" autoFocus={!category} onSubmit={remember} />

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Chip selected={selected === "all"} onClick={() => setSelected("all")}>
          Tudo
        </Chip>
        {categories.map((c) => (
          <Chip key={c.id} selected={selected === c.id} onClick={() => setSelected(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>

      {browsing && me.recentSearches.length ? (
        <section className="mt-6">
          <div className="flex items-baseline justify-between px-1">
            <h2 className="type-title3">Buscas recentes</h2>
            <button type="button" onClick={() => void actions.clearRecent().catch(() => {})} className="cursor-pointer type-body text-primary">
              Limpar
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {me.recentSearches.map((term) => (
              <Chip key={term} onClick={() => setQuery(term)}>
                {term}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      <Segmented
        label="Ordenar"
        className="mt-6"
        value={sort}
        onChange={setSort}
        options={[
          { value: "near", label: "Mais perto" },
          { value: "price", label: "Menor preço" },
          { value: "rating", label: "Avaliação" },
        ]}
      />

      {failed ? (
        <EmptyState
          mood="sad"
          title="Não deu para buscar"
          text="Confira a internet e tente de novo."
          action={
            <Button size="md" onClick={() => setAttempt((n) => n + 1)}>
              Tentar de novo
            </Button>
          }
        />
      ) : results === null ? (
        <div className="mt-4 flex flex-col gap-2" aria-label="Buscando">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[86px] rounded-[22px] shimmer" />
          ))}
        </div>
      ) : results.length ? (
        <Group className="mt-4" footer={`${results.length} ${results.length === 1 ? "resultado" : "resultados"} perto de ${origin.label}`}>
          {results.map((l) => (
            <ListingRow
              key={l.item.id}
              item={l.item}
              business={l.business}
              km={l.km}
              onClick={() => {
                remember();
                nav.push("item", { id: l.item.id });
              }}
            />
          ))}
        </Group>
      ) : (
        <EmptyState mood="think" title="Não achei nada" text={browsing ? "Ainda não há equipamentos perto desse endereço." : "Tente outro nome ou escolha outra categoria."} />
      )}
    </Page>
  );
}
