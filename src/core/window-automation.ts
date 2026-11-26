import {
  surfaceRegistry,
  type SurfaceAdapter,
} from "./app-surface-registry.tsx";
/** Accessibility-like controls for in-process apps. Opaque iframes/Wayland pixels need their own semantic adapter. */
export function attachWindowAutomation(id: string, root: HTMLElement) {
  let sequence = 0,
    revision = 0,
    last = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  const ids = new WeakMap<HTMLElement, string>(),
    controls = new Map<string, HTMLElement>();
  const privateElement = (el: HTMLElement) =>
    !!el.closest('[data-private],input[type="password"],input[type="hidden"]');
  const snapshot = () => {
    const body = root.querySelector<HTMLElement>(".horizon-windowbody");
    controls.clear();
    const items = [
      ...(body?.querySelectorAll<HTMLElement>(
        'button,input,textarea,select,a[href],[role="button"],[contenteditable="true"]',
      ) ?? []),
    ]
      .filter((el) => !privateElement(el) && !el.hidden)
      .slice(0, 250)
      .map((el) => {
        let key = ids.get(el);
        if (!key) {
          key = "control-" + ++sequence;
          ids.set(el, key);
        }
        controls.set(key, el);
        const field = el as HTMLInputElement;
        return {
          id: key,
          role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
          label:
            el.getAttribute("aria-label") ??
            el.getAttribute("title") ??
            el.textContent?.trim().slice(0, 160) ??
            "",
          value: field.value,
          checked:
            field.type === "checkbox" || field.type === "radio"
              ? field.checked
              : undefined,
          disabled: !!field.disabled,
          type: field.type,
          options:
            el instanceof HTMLSelectElement
              ? [...el.options].map((o) => ({ value: o.value, label: o.label }))
              : undefined,
        };
      });
    const clone = body?.cloneNode(true) as HTMLElement | undefined;
    clone
      ?.querySelectorAll("[data-private],input[type=password],script,style")
      .forEach((el) => el.remove());
    return {
      text: clone?.textContent?.slice(0, 16000) ?? "",
      controls: items,
      opaqueFrames: body?.querySelectorAll("iframe,canvas").length ?? 0,
    };
  };
  const target = (args: Record<string, unknown>) => {
    snapshot();
    const el = controls.get(String(args.id));
    if (!el || !el.isConnected || privateElement(el))
      throw new Error("Contrôle absent ou privé. Relisez la session.");
    if ((el as HTMLButtonElement).disabled)
      throw new Error("Contrôle désactivé.");
    return el;
  };
  const refresh = () => {
    const value = JSON.stringify(snapshot());
    if (value === last) return;
    last = value;
    revision++;
    unregister?.();
    unregister = surfaceRegistry.registerUi(id, adapter);
  };
  const schedule = () => {
    if (!timer)
      timer = setTimeout(() => {
        timer = undefined;
        refresh();
      }, 100);
  };
  const adapter: SurfaceAdapter = {
    get revision() {
      return "ui:" + revision;
    },
    get state() {
      return snapshot();
    },
    get status() {
      return snapshot().opaqueFrames ? ("opaque" as const) : ("live" as const);
    },
    actions: {
      "ui.activate": {
        label: "Activer un contrôle de l’interface",
        paramsSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        run: (args) => {
          target(args).click();
          return { activated: args.id };
        },
      },
      "ui.input": {
        label: "Remplir un champ ou sélectionner une option",
        paramsSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            value: { type: "string" },
            checked: { type: "boolean" },
          },
          required: ["id"],
        },
        run: (args) => {
          const el = target(args);
          if (
            el instanceof HTMLInputElement &&
            ["file", "password", "hidden"].includes(el.type)
          )
            throw new Error(
              "Utilisez une commande sémantique pour importer un fichier.",
            );
          const proto =
            el instanceof HTMLTextAreaElement
              ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement
                ? HTMLSelectElement.prototype
                : el instanceof HTMLInputElement
                  ? HTMLInputElement.prototype
                  : null;
          if (proto) {
            const check =
              el instanceof HTMLInputElement &&
              ["checkbox", "radio"].includes(el.type);
            Object.getOwnPropertyDescriptor(
              proto,
              check ? "checked" : "value",
            )?.set?.call(el, check ? !!args.checked : String(args.value ?? ""));
          } else if (el.isContentEditable)
            el.textContent = String(args.value ?? "");
          else throw new Error("Ce contrôle n’est pas éditable.");
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return { updated: args.id };
        },
      },
      "ui.scroll": {
        label: "Faire défiler une zone de l’interface",
        paramsSchema: {
          type: "object",
          properties: { id: { type: "string" }, top: { type: "number" } },
        },
        run: (args) => {
          const el = args.id
            ? target(args)
            : root.querySelector<HTMLElement>(".horizon-windowbody");
          el?.scrollTo({ top: Number(args.top) || 0 });
          return { scrolled: true };
        },
      },
    },
  };
  let unregister: (() => void) | undefined;
  const observer = new MutationObserver(schedule);
  observer.observe(root.querySelector(".horizon-windowbody") ?? root, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  root.addEventListener("input", schedule);
  root.addEventListener("change", schedule);
  refresh();
  return () => {
    observer.disconnect();
    if (timer) clearTimeout(timer);
    root.removeEventListener("input", schedule);
    root.removeEventListener("change", schedule);
    unregister?.();
  };
}
