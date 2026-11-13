import { useEffect, useState } from "react";
import { History, MapPin, Navigation } from "lucide-react";
import { fold } from "../lib/format.ts";
import { currentPosition, presetPlaces, reverseGeocode, searchPlaces, type Address } from "../lib/geo.ts";
import { toast } from "../lib/toast.ts";
import { Group, Row, SearchField, Spinner } from "./controls.tsx";
import { Sheet } from "./Sheet.tsx";

type Status = "idle" | "loading" | "offline" | "empty";

export function AddressSearch({
  onSelect,
  saved = [],
  autoFocus,
}: {
  onSelect: (address: Address) => void;
  saved?: Address[];
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Address[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [locating, setLocating] = useState(false);
  const searching = query.trim().length >= 3;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    const controller = new AbortController();
    setStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const found = await searchPlaces(q, controller.signal);
        setResults(found);
        setStatus(found.length ? "idle" : "empty");
      } catch {
        if (controller.signal.aborted) return;
        const local = presetPlaces.filter((p) => fold(`${p.label} ${p.detail}`).includes(fold(q)));
        setResults(local);
        setStatus(local.length ? "idle" : "offline");
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  async function locate() {
    setLocating(true);
    try {
      const point = await currentPosition();
      const address = await reverseGeocode(point).catch(() => ({ label: "Localização atual", detail: "", ...point }));
      onSelect(address);
    } catch {
      toast("Não foi possível usar sua localização", "error");
    } finally {
      setLocating(false);
    }
  }

  return (
    <div>
      <SearchField value={query} onChange={setQuery} placeholder="Rua, número ou bairro" autoFocus={autoFocus} />
      <Group className="mt-4">
        <Row
          icon={Navigation}
          tone="blue"
          title="Usar localização atual"
          onClick={locate}
          trailing={locating ? <Spinner className="size-5 text-muted-foreground" /> : null}
        />
      </Group>
      {searching ? (
        status === "loading" || (status === "idle" && results.length === 0) ? (
          <div className="mt-6 flex flex-col gap-2" aria-label="Buscando endereços">
            {[0, 1, 2].map((i) => (
              <div key={i} className="shimmer h-14 rounded-[18px]" />
            ))}
          </div>
        ) : results.length ? (
          <Group title="Resultados">
            {results.map((address) => (
              <Row
                key={`${address.label}-${address.lat}`}
                icon={MapPin}
                tone="gray"
                title={address.label}
                subtitle={address.detail}
                onClick={() => onSelect(address)}
              />
            ))}
          </Group>
        ) : (
          <p className="mt-8 px-6 text-center type-subhead text-muted-foreground">
            {status === "offline" ? "Sem conexão com o mapa agora. Escolha uma sugestão abaixo." : "Nenhum endereço com esse nome."}
          </p>
        )
      ) : (
        <>
          {saved.length ? (
            <Group title="Salvos">
              {saved.map((address) => (
                <Row
                  key={`${address.label}-${address.lat}`}
                  icon={History}
                  tone="indigo"
                  title={address.label}
                  subtitle={address.detail}
                  onClick={() => onSelect(address)}
                />
              ))}
            </Group>
          ) : null}
          <Group title="Sugestões">
            {presetPlaces.map((address) => (
              <Row key={address.label} icon={MapPin} tone="gray" title={address.label} subtitle={address.detail} onClick={() => onSelect(address)} />
            ))}
          </Group>
        </>
      )}
    </div>
  );
}

export function AddressSheet({
  open,
  onClose,
  onSelect,
  saved,
  title = "Endereço",
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (address: Address) => void;
  saved?: Address[];
  title?: string;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title} large>
      <AddressSearch
        saved={saved}
        autoFocus
        onSelect={(address) => {
          onSelect(address);
          onClose();
        }}
      />
    </Sheet>
  );
}
