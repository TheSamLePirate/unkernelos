import {
  WindowSessionContext,
  useAppSurface,
  useSurfaceRevision,
} from "../../core/app-surface-registry.tsx";
import { Effect } from "effect";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Globe,
  Home,
  LoaderCircle,
  Monitor,
  RefreshCw,
  Search,
  Smartphone,
  Tablet,
  X,
  Plus,
} from "lucide-react";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  appRuntime,
  useSubscriptionRef,
  VmService,
} from "../../core/runtime.ts";
import { useWm, wmStore } from "../../wm/wm-store.ts";
import { parseBrowserAddress } from "../../core/browser-address.ts";
import {
  NativeBrowserClient,
  type NativePageState,
} from "../../core/native-browser.ts";
import { getCompanionConfig } from "../../core/companion-config.ts";
import { NativeBrowserView } from "./NativeBrowserView.tsx";
import "./PreviewBrowserApp.css";
type Mode = "home" | "web" | "guest";
type Viewport = "desktop" | "tablet" | "mobile";
export const PreviewBrowserApp: React.FC = () => {
  const wm = useWm();
  const session = useContext(WindowSessionContext);
  const requestedAddress =
    typeof session?.props?.browserAddress === "string"
      ? session.props.browserAddress
      : "unkernel:newtab";
  const vm = useSubscriptionRef(
    Effect.map(VmService, (v) => v.stateRef),
    { detectedPorts: [] } as unknown as Awaited<ReturnType<typeof getVmState>>,
  );
  const [address, setAddress] = useState(requestedAddress),
    [mode, setMode] = useState<Mode>("home"),
    [iframe, setIframe] = useState("");
  const [guestRevision, setGuestRevision] = useState(0);
  const [page, setPage] = useState<NativePageState>({
    url: "",
    title: "Nouvel onglet",
    canBack: false,
    canForward: false,
  });
  const [client, setClient] = useState<NativeBrowserClient | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [viewport, setViewport] = useState<Viewport>("desktop");
  const [snapshot, setSnapshot] = useState<unknown>(null),
    [dialog, setDialog] = useState<Record<string, unknown> | null>(null),
    [popup, setPopup] = useState("");
  const clientRef = useRef<NativeBrowserClient | null>(null),
    inputRef = useRef<HTMLInputElement>(null),
    urlFocused = useRef(false),
    navigation = useRef(0),
    alive = useRef(true);
  const snapshotJson = useRef("");
  const loadSnapshot = async (c = clientRef.current) => {
    if (c) {
      try {
        const s = await c.call("snapshot");
        if (alive.current && snapshotJson.current !== JSON.stringify(s)) {
          snapshotJson.current = JSON.stringify(s);
          setSnapshot(s);
        }
      } catch {
        /* Page may be navigating. */
      }
    }
  };
  const engine = () => {
    if (clientRef.current) return clientRef.current;
    const c = new NativeBrowserClient((event) => {
      if (!alive.current) return;
      if (event.type === "state") {
        const state = event.state as NativePageState;
        setPage(state);
        if (!urlFocused.current && state.url && state.url !== "about:blank")
          setAddress(state.url);
      } else if (event.type === "loading") {
        setLoading(Boolean(event.loading));
        if (!event.loading) void loadSnapshot(c);
      } else if (event.type === "dialog")
        setDialog(event.dialog as Record<string, unknown>);
      else if (event.type === "popup") setPopup(String(event.url));
      else if (event.type === "error") {
        setError(String(event.error));
        setLoading(false);
      }
    });
    clientRef.current = c;
    setClient(c);
    return c;
  };
  const navigate = async (raw: string) => {
    const turn = ++navigation.current;
    setError("");
    setPopup("");
    snapshotJson.current = "";
    setSnapshot(null);
    try {
      const target = parseBrowserAddress(raw);
      setAddress(target.address);
      if (target.kind === "home") {
        setMode("home");
        setLoading(false);
        clientRef.current?.close();
        clientRef.current = null;
        setClient(null);
        setPage({
          url: "",
          title: "Nouvel onglet",
          canBack: false,
          canForward: false,
        });
        return { url: target.address };
      }
      if (target.kind === "guest") {
        setMode("guest");
        setLoading(true);
        clientRef.current?.close();
        clientRef.current = null;
        setClient(null);
        const url = await appRuntime.runPromise(
          Effect.gen(function* () {
            const v = yield* VmService;
            yield* Effect.promise(() => v.previewRelay.ready());
            return v.previewRelay.previewUrl(target.port, target.path);
          }),
        );
        if (turn === navigation.current) {
          setIframe(url);
          setGuestRevision((v) => v + 1);
          setLoading(false);
          setPage({
            url: target.address,
            title: "Linux · localhost:" + target.port,
            canBack: false,
            canForward: false,
          });
        }
        return { url: target.address };
      }
      setMode("web");
      setLoading(true);
      const c = engine();
      await c.call("navigate", { url: target.url });
      return { url: target.url };
    } catch (e) {
      setLoading(false);
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      throw e;
    }
  };
  const run = (action: string, args: Record<string, unknown> = {}) => {
    if (!clientRef.current || mode !== "web")
      throw new Error("Ouvrez une page Internet avant cette action.");
    return clientRef.current.call(action, args);
  };
  const revision = useSurfaceRevision(
    mode,
    page.url,
    page.title,
    loading,
    error,
    snapshot,
    dialog,
    guestRevision,
  );
  useAppSurface({
    document: mode === "guest" ? iframe : page.url,
    title: page.title || "Navigateur",
    revision,
    status: error
      ? "disconnected"
      : loading
        ? "loading"
        : mode === "guest"
          ? "opaque"
          : "live",
    state: {
      mode,
      url: mode === "home" ? "unkernel:newtab" : page.url,
      title: page.title,
      loading,
      error: error || null,
      engine:
        mode === "web"
          ? "Chromium companion"
          : mode === "guest"
            ? "guest preview"
            : null,
      canBack: page.canBack,
      canForward: page.canForward,
      page: snapshot,
      dialog,
      contentAccess: mode === "guest" ? "opaque" : "structured",
    },
    actions: {
      navigate: {
        label:
          "Ouvrir une adresse HTTP(S), un serveur Linux ou un nouvel onglet",
        paramsSchema: {
          type: "object",
          properties: { url: { type: "string" } },
          required: ["url"],
        },
        run: (a) => navigate(String(a.url ?? "")),
      },
      reload: {
        label: "Recharger la page",
        run: () => (mode === "guest" ? navigate(address) : run("reload")),
      },
      back: { label: "Page précédente", run: () => run("back") },
      forward: { label: "Page suivante", run: () => run("forward") },
      stop: { label: "Arrêter le chargement", run: () => run("stop") },
      snapshot: {
        label:
          "Lire le texte et les contrôles visibles de la page (sans valeurs des champs)",
        run: async () => {
          const value = await run("snapshot");
          setSnapshot(value);
          return value;
        },
      },
      click: {
        label: "Cliquer un contrôle de la page par sélecteur CSS",
        paramsSchema: {
          type: "object",
          properties: { selector: { type: "string" } },
          required: ["selector"],
        },
        run: (a) => run("click", a),
      },
      fill: {
        label: "Saisir du texte dans un champ de la page",
        paramsSchema: {
          type: "object",
          properties: {
            selector: { type: "string" },
            value: { type: "string" },
          },
          required: ["selector", "value"],
        },
        run: (a) => run("fill", a),
      },
      scroll: {
        label: "Faire défiler la page",
        paramsSchema: {
          type: "object",
          properties: {
            deltaX: { type: "number" },
            deltaY: { type: "number" },
          },
        },
        run: (a) =>
          run("pointer", {
            kind: "mouseWheel",
            x: 200,
            y: 200,
            deltaX: Number(a.deltaX) || 0,
            deltaY: Number(a.deltaY) || 0,
          }),
      },
      dialog: {
        label: "Répondre à une boîte de dialogue de la page",
        paramsSchema: {
          type: "object",
          properties: { accept: { type: "boolean" }, text: { type: "string" } },
          required: ["accept"],
        },
        run: async (a) => {
          const result = await run("dialog", a);
          setDialog(null);
          return result;
        },
      },
      key: {
        label: "Envoyer une touche au navigateur",
        run: (a) => run("key", { kind: "keyDown", ...a }),
      },
    },
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      navigation.current++;
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, []);
  useEffect(() => {
    void navigate(requestedAddress).catch(() => {});
  }, [requestedAddress, session?.props?.navigationId]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (wmStore.getSnapshot().activeWindowId !== session?.id) return;
      const letter = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && ["l", "r"].includes(letter)) {
        e.preventDefault();
        e.stopPropagation();
        if (letter === "l") {
          inputRef.current?.focus();
          inputRef.current?.select();
        } else if (mode === "guest") void navigate(address).catch(() => {});
        else if (mode === "web") buttonRun("reload");
      } else if (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        if (
          mode === "web" &&
          (e.key === "ArrowLeft" ? page.canBack : page.canForward)
        )
          buttonRun(e.key === "ArrowLeft" ? "back" : "forward");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [session?.id, mode, address, error, page.canBack, page.canForward]);
  const buttonRun = (action: string) => {
    if (error && action === "reload") {
      clientRef.current?.close();
      clientRef.current = null;
      setClient(null);
      void navigate(address).catch(() => {});
      return;
    }
    void run(action).catch((e) => setError(e.message));
  };
  return (
    <div className="os-browser" data-os-browser>
      <form
        className="os-browser-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
          void navigate(address).catch(() => {});
        }}
      >
        <button
          type="button"
          title="Page précédente"
          aria-label="Page précédente"
          disabled={!page.canBack || mode !== "web"}
          onClick={() => buttonRun("back")}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          type="button"
          title="Page suivante"
          aria-label="Page suivante"
          disabled={!page.canForward || mode !== "web"}
          onClick={() => buttonRun("forward")}
        >
          <ArrowRight size={16} />
        </button>
        <button
          type="button"
          title={loading ? "Arrêter" : "Recharger"}
          aria-label={loading ? "Arrêter" : "Recharger"}
          onClick={() =>
            mode === "guest"
              ? void navigate(address).catch(() => {})
              : mode === "home"
                ? undefined
                : buttonRun(loading ? "stop" : "reload")
          }
        >
          {loading ? <X size={15} /> : <RefreshCw size={15} />}
        </button>
        <button
          type="button"
          title="Accueil"
          aria-label="Accueil"
          onClick={() => void navigate("unkernel:newtab")}
        >
          <Home size={15} />
        </button>
        <button
          type="button"
          aria-label="Nouvelle fenêtre web"
          title="Nouvelle fenêtre web"
          onClick={() => wmStore.openBrowser("unkernel:newtab", true)}
        >
          <Plus size={15} />
        </button>
        <label className="os-browser-address">
          {loading ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : (
            <Globe size={15} />
          )}
          <input
            ref={inputRef}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onFocus={(e) => {
              urlFocused.current = true;
              e.target.select();
            }}
            onBlur={() => (urlFocused.current = false)}
            aria-label="Adresse web"
            placeholder="Adresse web ou localhost:3000"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <button type="submit" aria-label="Ouvrir l’adresse">
            ↵
          </button>
        </label>
        <div className="os-browser-viewport">
          {(
            [
              ["desktop", Monitor],
              ["tablet", Tablet],
              ["mobile", Smartphone],
            ] as const
          ).map(([v, Icon]) => (
            <button
              type="button"
              key={v}
              title={v}
              aria-label={"Vue " + v}
              className={viewport === v ? "selected" : ""}
              onClick={() => setViewport(v)}
            >
              <Icon size={14} />
            </button>
          ))}
        </div>
        {mode !== "home" && (
          <a
            href={mode === "guest" ? iframe : page.url || address}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir dans le navigateur du Mac"
            aria-label="Ouvrir dans le navigateur du Mac"
          >
            <ExternalLink size={15} />
          </a>
        )}
      </form>
      <div className="os-browser-status">
        <span
          className={
            "os-browser-dot " +
            (mode === "web" && client && !error ? "connected" : "")
          }
        />
        <span>
          {mode === "web"
            ? "Chromium · profil unkernelOS"
            : mode === "guest"
              ? "Aperçu du serveur Linux"
              : "Navigateur unkernelOS"}
        </span>
        <span className="os-browser-status-spacer" />
        {vm.detectedPorts.map((p) => (
          <button
            key={p.port}
            onClick={() =>
              void navigate("http://guest:" + p.port + "/").catch(() => {})
            }
          >
            Linux :{p.port}
          </button>
        ))}
      </div>
      {popup && (
        <div className="os-browser-notice">
          La page souhaite ouvrir un autre onglet.{" "}
          <button onClick={() => void navigate(popup).catch(() => {})}>
            Ouvrir ici
          </button>
          <button onClick={() => setPopup("")} aria-label="Ignorer">
            ×
          </button>
        </div>
      )}
      {error && (
        <div className="os-browser-error" role="alert">
          <Globe size={16} />
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Fermer l’erreur">
            ×
          </button>
        </div>
      )}
      <div className="os-browser-content">
        {mode === "home" ? (
          <div className="os-browser-home">
            <div className="os-browser-home-icon">
              <Globe size={34} />
            </div>
            <span>UNKERNEL / WEB</span>
            <h1>Le Web, dans votre espace.</h1>
            <p>Sites Internet et applications Linux, à la même adresse.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void navigate(
                  address === "unkernel:newtab"
                    ? "https://www.wikipedia.org"
                    : address,
                ).catch(() => {});
              }}
            >
              <Search size={18} />
              <input
                aria-label="Ouvrir un site"
                placeholder="Saisissez une adresse : wikipedia.org"
                onChange={(e) => setAddress(e.target.value)}
              />
              <button>Ouvrir ↗</button>
            </form>
            <div className="os-browser-shortcuts">
              {[
                ["W", "Wikipédia", "https://www.wikipedia.org"],
                ["G", "GitHub", "https://github.com"],
                ["M", "MDN", "https://developer.mozilla.org"],
                ["⌘", "Linux :3000", "http://guest:3000/"],
              ].map(([icon, label, url]) => (
                <button
                  key={url}
                  onClick={() => void navigate(url).catch(() => {})}
                >
                  <b>{icon}</b>
                  <span>{label}</span>
                </button>
              ))}
            </div>
            <p className="os-browser-home-note">
              {getCompanionConfig()
                ? "Moteur Chromium local · sessions séparées de votre navigateur personnel"
                : "Ouvrez cette version depuis le companion pour naviguer sur Internet."}
            </p>
          </div>
        ) : (
          <div className={"os-browser-page viewport-" + viewport}>
            {mode === "guest" ? (
              iframe && (
                <iframe
                  key={guestRevision}
                  src={iframe}
                  title="Application Linux"
                  onLoad={() => setLoading(false)}
                />
              )
            ) : client ? (
              <NativeBrowserView
                client={client}
                onError={setError}
                dialog={dialog}
                onDialogClose={() => setDialog(null)}
              />
            ) : (
              <div className="os-browser-placeholder">
                <Globe size={32} />
                <p>Connexion au moteur web…</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
async function getVmState() {
  return appRuntime.runPromise(
    Effect.flatMap(VmService, (v) => v.stateRef.get),
  );
}
