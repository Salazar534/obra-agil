import { Compass, CreditCard, Map as MapIcon, Package } from "lucide-react";
import type { CategoryId } from "../../lib/catalog.ts";
import { Shell, type Route } from "../../lib/nav.tsx";
import { activeStatuses, ordersOf, useDB } from "../../lib/store.ts";
import type { TabDef } from "../../ui/TabBar.tsx";
import { ChatScreen } from "../shared/Chat.tsx";
import { OrderScreen } from "../shared/OrderScreen.tsx";
import { AddressesScreen, EditProfileScreen, ProfileScreen, SavedScreen } from "../shared/Profile.tsx";
import { BusinessScreen } from "./BusinessScreen.tsx";
import { Explore } from "./Explore.tsx";
import { ItemScreen } from "./ItemScreen.tsx";
import { MapTab } from "./MapTab.tsx";
import { OrdersScreen } from "./Orders.tsx";
import { SearchScreen } from "./Search.tsx";
import { WalletScreen } from "./Wallet.tsx";

function render(route: Route) {
  const id = route.params.id ?? "";
  switch (route.name) {
    case "explore":
      return <Explore />;
    case "map":
      return <MapTab />;
    case "orders":
      return <OrdersScreen />;
    case "wallet":
      return <WalletScreen />;
    case "search":
      return <SearchScreen category={route.params.category as CategoryId | undefined} />;
    case "business":
      return <BusinessScreen id={id} />;
    case "item":
      return <ItemScreen id={id} />;
    case "order":
      return <OrderScreen id={id} />;
    case "chat":
      return <ChatScreen orderId={id} />;
    case "profile":
      return <ProfileScreen />;
    case "editProfile":
      return <EditProfileScreen />;
    case "addresses":
      return <AddressesScreen />;
    case "saved":
      return <SavedScreen />;
    default:
      return null;
  }
}

export function CustomerApp() {
  const db = useDB();
  const unread = ordersOf(db)
    .filter((o) => activeStatuses.includes(o.status))
    .reduce((total, order) => total + order.unread, 0);

  const tabs: TabDef[] = [
    { id: "explore", label: "Explorar", icon: Compass },
    { id: "map", label: "Mapa", icon: MapIcon },
    { id: "orders", label: "Pedidos", icon: Package, badge: unread || undefined },
    { id: "wallet", label: "Carteira", icon: CreditCard },
  ];

  return <Shell layout="market" tabs={tabs} render={render} hideTabBar={(route) => route.name === "item" || route.name === "chat"} />;
}
