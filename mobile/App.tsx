import Constants from "expo-constants";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, BackHandler, Image, Linking, Platform, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { initialWindowMetrics, SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

const devHost = (Constants.expoConfig?.hostUri ?? Constants.linkingUri.replace(/^\w+:\/\//, "")).split(/[:/]/)[0];
const onLan = !devHost || devHost === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(devHost);
/** Through a tunnel the dev server has no LAN address, so the web app's public URL comes from EXPO_PUBLIC_WEB_URL. */
const WEB_URL = (!onLan && process.env.EXPO_PUBLIC_WEB_URL?.replace(/\/$/, "")) || `http://${devHost || "localhost"}:5173`;

const BLUE = "#0A66E0";
const BACKGROUND = "#F2F2F7";

type WebMessage =
  | { type: "haptic"; kind: "success" | "notify" | "tap" }
  | { type: "locate" }
  | { type: "share"; title: string }
  | { type: "exit" };

function insetsScript(top: number, bottom: number) {
  return `(function(){var r=document.documentElement;if(!r)return;r.style.setProperty("--safe-top","${top}px");r.style.setProperty("--safe-bottom","${bottom}px");r.dataset.native="${Platform.OS}";})();true;`;
}

function dispatchScript(event: string) {
  return `window.dispatchEvent(new Event(${JSON.stringify(event)}));true;`;
}

function replyScript(payload: Record<string, unknown>) {
  return `window.dispatchEvent(new MessageEvent("message",{data:${JSON.stringify(JSON.stringify(payload))}}));true;`;
}

async function locate() {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return { type: "location", error: "denied" };
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  const position = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { type: "location", lat: position.coords.latitude, lng: position.coords.longitude };
}

function haptic(kind: "success" | "notify" | "tap") {
  if (kind === "success") return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  if (kind === "notify") return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  return Haptics.selectionAsync();
}

function ObraAgil() {
  const insets = useSafeAreaInsets();
  const web = useRef<WebView<object>>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [splash] = useState(() => new Animated.Value(1));

  useEffect(() => {
    web.current?.injectJavaScript(insetsScript(insets.top, insets.bottom));
  }, [insets.top, insets.bottom]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (failed || !ready) return false;
      web.current?.injectJavaScript(dispatchScript("obra:back"));
      return true;
    });
    return () => subscription.remove();
  }, [failed, ready]);

  useEffect(() => {
    if (!ready) return;
    Animated.timing(splash, { toValue: 0, duration: 260, delay: 120, useNativeDriver: true }).start();
  }, [ready, splash]);

  async function onMessage(event: WebViewMessageEvent) {
    let message: WebMessage;
    try {
      message = JSON.parse(event.nativeEvent.data) as WebMessage;
    } catch {
      return;
    }
    switch (message.type) {
      case "haptic":
        haptic(message.kind).catch(() => {});
        break;
      case "locate": {
        const reply = await locate().catch(() => ({ type: "location", error: "unavailable" }));
        web.current?.injectJavaScript(replyScript(reply));
        break;
      }
      case "share":
        Share.share({ message: message.title }).catch(() => {});
        break;
      case "exit":
        BackHandler.exitApp();
        break;
    }
  }

  function onShouldStartLoadWithRequest(request: ShouldStartLoadRequest) {
    if (request.isTopFrame === false) return true;
    if (request.url.startsWith(WEB_URL) || /^(about|data|blob):/.test(request.url)) return true;
    Linking.openURL(request.url).catch(() => {});
    return false;
  }

  function retry() {
    splash.setValue(1);
    setFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      {!failed && (
        <WebView<object>
          key={attempt}
          ref={web}
          source={{ uri: WEB_URL }}
          style={styles.web}
          injectedJavaScriptBeforeContentLoaded={insetsScript(insets.top, insets.bottom)}
          onLoadEnd={() => {
            web.current?.injectJavaScript(insetsScript(insets.top, insets.bottom));
            setReady(true);
          }}
          onError={() => setFailed(true)}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
          onContentProcessDidTerminate={() => web.current?.reload()}
          onRenderProcessGone={() => web.current?.reload()}
          applicationNameForUserAgent="ObraAgil/1.0"
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          bounces={false}
          overScrollMode="never"
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          webviewDebuggingEnabled={__DEV__}
        />
      )}

      {failed ? (
        <View style={[styles.center, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
          <Image source={require("./assets/obi.png")} style={styles.mascot} />
          <Text style={styles.title}>Não consegui abrir o Obi Ágil</Text>
          <Text style={styles.body}>
            Confira se o computador está rodando o app (npm run dev) e se o celular está no mesmo Wi‑Fi.
          </Text>
          <Text style={styles.url}>{WEB_URL}</Text>
          <Pressable onPress={retry} style={({ pressed }) => [styles.button, pressed && { opacity: 0.8 }]}>
            <Text style={styles.buttonLabel}>Tentar de novo</Text>
          </Pressable>
        </View>
      ) : (
        <Animated.View pointerEvents={ready ? "none" : "auto"} style={[StyleSheet.absoluteFill, styles.center, { opacity: splash }]}>
          <Image source={require("./assets/obi.png")} style={styles.mascot} />
          <Text style={styles.brand}>Obi Ágil</Text>
          <ActivityIndicator color={BLUE} style={{ marginTop: 18 }} />
        </Animated.View>
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <ObraAgil />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BACKGROUND },
  web: { flex: 1, backgroundColor: BACKGROUND },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, backgroundColor: BACKGROUND },
  mascot: { width: 132, height: 132 },
  brand: { marginTop: 12, fontSize: 28, fontWeight: "800", color: "#0B1B33", letterSpacing: -0.4 },
  title: { marginTop: 16, fontSize: 22, fontWeight: "700", color: "#0B1B33", textAlign: "center" },
  body: { marginTop: 8, fontSize: 16, lineHeight: 22, color: "#6C6C70", textAlign: "center" },
  url: { marginTop: 10, fontSize: 13, color: "#8E8E93", fontVariant: ["tabular-nums"] },
  button: { marginTop: 24, height: 50, paddingHorizontal: 28, borderRadius: 25, backgroundColor: BLUE, justifyContent: "center" },
  buttonLabel: { color: "#FFFFFF", fontSize: 17, fontWeight: "600" },
});
