import { isNativeShell, requestNative } from "./native.ts";

export type LatLng = { lat: number; lng: number };
export type Address = LatLng & { label: string; detail: string };

export const DEFAULT_ADDRESS: Address = {
  label: "Avenida Paulista, 1578",
  detail: "Bela Vista, São Paulo",
  lat: -23.5614,
  lng: -46.6559,
};

export const presetPlaces: Address[] = [
  DEFAULT_ADDRESS,
  { label: "Rua dos Pinheiros, 870", detail: "Pinheiros, São Paulo", lat: -23.5657, lng: -46.683 },
  { label: "Rua Domingos de Morais, 2200", detail: "Vila Mariana, São Paulo", lat: -23.5935, lng: -46.6365 },
  { label: "Avenida Ibirapuera, 3100", detail: "Moema, São Paulo", lat: -23.6036, lng: -46.666 },
  { label: "Rua Voluntários da Pátria, 300", detail: "Botafogo, Rio de Janeiro", lat: -22.9519, lng: -43.1846 },
  { label: "Avenida do Contorno, 6000", detail: "Savassi, Belo Horizonte", lat: -19.9381, lng: -43.9339 },
  { label: "Rua Comendador Araújo, 500", detail: "Batel, Curitiba", lat: -25.4405, lng: -49.286 },
];

export function distanceKm(a: LatLng, b: LatLng) {
  const r = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

export function formatKm(km: number) {
  if (km < 1) return `${Math.max(100, Math.round((km * 1000) / 50) * 50)} m`;
  return `${km.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function offsetPoint(origin: LatLng, northKm: number, eastKm: number): LatLng {
  return {
    lat: origin.lat + northKm / 111.32,
    lng: origin.lng + eastKm / (111.32 * Math.cos((origin.lat * Math.PI) / 180)),
  };
}

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: Record<string, string | undefined>;
};

function toAddress(result: NominatimResult): Address {
  const a = result.address ?? {};
  const area = a.suburb || a.neighbourhood || a.quarter || a.city_district || "";
  const city = a.city || a.town || a.village || a.municipality || a.state || "";
  const street = a.road || a.pedestrian || a.footway || result.name || area || result.display_name.split(",")[0]?.trim() || "Localização atual";
  const label = a.house_number ? `${street}, ${a.house_number}` : street;
  const detail = [area, city].filter((part, index, all) => part && part !== street && all.indexOf(part) === index).join(", ");
  return { label, detail, lat: Number(result.lat), lng: Number(result.lon) };
}

export function withLabel(address: Address): Address {
  if (address.label.trim()) return address;
  return { ...address, label: address.detail.split(",")[0]?.trim() || "Localização atual" };
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Address[]> {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=br&accept-language=pt-BR&q=" +
    encodeURIComponent(query);
  const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("search failed");
  const data = (await response.json()) as NominatimResult[];
  const seen = new Set<string>();
  return data.map(toAddress).filter((item) => {
    const key = `${item.label}|${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function reverseGeocode(point: LatLng): Promise<Address> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&accept-language=pt-BR&lat=${point.lat}&lon=${point.lng}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("reverse failed");
  return toAddress((await response.json()) as NominatimResult);
}

export function currentPosition(): Promise<LatLng> {
  if (isNativeShell()) {
    return requestNative<LatLng>({ type: "locate" }, "location").then(({ lat, lng }) => ({ lat, lng }));
  }
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function directionsUrl(point: LatLng) {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lng}`;
}
