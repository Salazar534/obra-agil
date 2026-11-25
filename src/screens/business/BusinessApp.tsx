import { Boxes, Inbox, LayoutGrid, Store } from "lucide-react";
import { Shell, type Route } from "../../lib/nav.tsx";
import { ordersOf, useDB } from "../../lib/store.ts";
import type { TabDef } from "../../ui/TabBar.tsx";
import { BusinessScreen } from "../customer/BusinessScreen.tsx";
import { ItemScreen } from "../customer/ItemScreen.tsx";
import { ChatScreen } from "../shared/Chat.tsx";
import { OrderScreen } from "../shared/OrderScreen.tsx";
import { EditProfileScreen, ProfileScreen } from "../shared/Profile.tsx";
import { Dashboard } from "./Dashboard.tsx";
import { FinanceScreen } from "./Finance.tsx";
import { Inventory } from "./Inventory.tsx";
import { Requests } from "./Requests.tsx";
import { StoreScreen } from "./StoreScreen.tsx";

function render(route: Route) {
  const id = route.params.id ?? "";
  switch (route.name) {
    case "dashboard":
      return <Dashboard />;
    case "inventory":
      return <Inventory />;
    case "requests":
      return <Requests />;
    case "store":
      return <StoreScreen />;
    case "finance":
      return <FinanceScreen />;
    case "order":
      return <OrderScreen id={id} />;
    case "chat":
      return <ChatScreen orderId={id} />;
    case "profile":
      return <ProfileScreen />;
    case "editProfile":
      return <EditProfileScreen />;
    case "business":
      return <BusinessScreen id={id} initialTab={route.params.tab === "reviews" ? "reviews" : "items"} />;
    case "item":
      return <ItemScreen id={id} />;
    default:
      return null;
  }
}

export function BusinessApp() {
  const db = useDB();
  const pending = ordersOf(db).filter((o) => o.status === "pending").length;
  const tabs: TabDef[] = [
    { id: "dashboard", label: "Painel", icon: LayoutGrid },
    { id: "inventory", label: "Estoque", icon: Boxes },
    { id: "requests", label: "Pedidos", icon: Inbox, badge: pending || undefined },
    { id: "store", label: "Loja", icon: Store },
  ];
  return <Shell layout="saas" tabs={tabs} render={render} hideTabBar={(route) => route.name === "item" || route.name === "chat"} />;
}
