import React, { useEffect, useRef, useState } from "react";
import { NativeBrowserClient } from "../../core/native-browser.ts";
import { screenToElement } from "../../core/spatial-pointer.ts";
export interface NativeBrowserViewProps {
  client: NativeBrowserClient;
  onError: (error: string) => void;
  dialog: Record<string, unknown> | null;
  onDialogClose: () => void;
}
export const NativeBrowserView: React.FC<NativeBrowserViewProps> = ({
  client,
  onError,
  dialog,
  onDialogClose,
}) => {
  const canvas = useRef<HTMLCanvasElement>(null),
    surface = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null),
    [prompt, setPrompt] = useState("");
  const composing = useRef(false),
    pressed = useRef(0),
    touch = useRef<{
      x: number;
      y: number;
      startX: number;
      startY: number;
    } | null>(null);
  useEffect(() => {
    const el = surface.current!;
    const resize = () =>
      client.send("resize", {
        width: Math.round(el.clientWidth),
        height: Math.round(el.clientHeight),
        scale: Math.min(devicePixelRatio, 2),
      });
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    void client
      .connect()
      .then(resize)
      .catch((e) => onError(e.message));
    let chain = Promise.resolve(),
      cancelled = false;
    const unwatch = client.frames((detail, ack) => {
      chain = chain.then(async () => {
        try {
          if (cancelled) return;
          const image = new Image();
          image.src = "data:image/jpeg;base64," + detail.data;
          await image.decode();
          const c = canvas.current;
          if (c && !cancelled) {
            c.width = image.naturalWidth;
            c.height = image.naturalHeight;
            c.getContext("2d", { alpha: false })?.drawImage(image, 0, 0);
          }
        } catch {
        } finally {
          if (ack) client.send("ack", { sessionId: detail.sessionId });
        }
      });
    });
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const p = screenToElement(el, event.clientX, event.clientY);
      const scale =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? el.clientHeight
            : 1;
      client.send("pointer", {
        kind: "mouseWheel",
        ...p,
        deltaX: event.deltaX * scale,
        deltaY: event.deltaY * scale,
        buttons: 0,
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    const release = () => {
      if (pressed.current) {
        client.send("pointer", {
          kind: "mouseReleased",
          x: 0,
          y: 0,
          button: pressed.current === 2 ? "right" : "left",
          buttons: 0,
          clickCount: 1,
        });
        pressed.current = 0;
      }
    };
    window.addEventListener("blur", release);
    return () => {
      cancelled = true;
      unwatch();
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
      window.removeEventListener("blur", release);
      release();
    };
  }, [client]);
  const point = (e: React.PointerEvent) =>
    screenToElement(surface.current!, e.clientX, e.clientY);
  const modifiers = (e: {
    altKey: boolean;
    ctrlKey: boolean;
    metaKey: boolean;
    shiftKey: boolean;
  }) =>
    (e.altKey ? 1 : 0) |
    (e.ctrlKey ? 2 : 0) |
    (e.metaKey ? 4 : 0) |
    (e.shiftKey ? 8 : 0);
  const key = async (e: React.KeyboardEvent, up = false) => {
    if (composing.current || e.nativeEvent.isComposing || e.keyCode === 229)
      return;
    const command = e.metaKey || e.ctrlKey;
    if (command && ["c", "x", "v", "a"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      if (up) return;
      try {
        if (e.key.toLowerCase() === "v") {
          const text = await navigator.clipboard.readText();
          await client.call("text", { text });
        } else if (["c", "x"].includes(e.key.toLowerCase())) {
          const text = await client.call("selection");
          await navigator.clipboard.writeText(String(text));
          if (e.key.toLowerCase() === "x")
            client.send("key", {
              kind: "keyDown",
              key: "Backspace",
              code: "Backspace",
              keyCode: 8,
            });
        } else
          client.send("key", {
            kind: "keyDown",
            key: "a",
            code: "KeyA",
            keyCode: 65,
            modifiers: 4,
          });
      } catch (error) {
        onError(error instanceof Error ? error.message : String(error));
      }
      return;
    }
    if (
      (command && ["l", "r"].includes(e.key.toLowerCase())) ||
      (e.altKey && ["ArrowLeft", "ArrowRight"].includes(e.key))
    )
      return;
    e.preventDefault();
    client.send("key", {
      kind: up ? "keyUp" : "keyDown",
      key: e.key,
      code: e.code,
      keyCode: e.keyCode,
      modifiers: modifiers(e),
      repeat: e.repeat,
      text:
        !up && e.key === "Enter"
          ? "\r"
          : !up && !command && e.key.length === 1
            ? e.key
            : "",
    });
  };
  return (
    <div
      className="native-browser-view"
      ref={surface}
      data-native-browser-surface
      onContextMenu={(e) => {
        e.preventDefault();
        const p = screenToElement(surface.current!, e.clientX, e.clientY);
        setMenu(p);
      }}
      onPointerDown={(e) => {
        e.preventDefault();
        setMenu(null);
        input.current?.focus({ preventScroll: true });
        surface.current?.setPointerCapture(e.pointerId);
        const p = point(e);
        if (e.pointerType === "touch") {
          touch.current = { ...p, startX: p.x, startY: p.y };
          return;
        }
        pressed.current = e.buttons;
        if (e.button === 2) return;
        client.send("pointer", {
          kind: "mousePressed",
          ...p,
          button: e.button === 1 ? "middle" : "left",
          buttons: e.buttons,
          clickCount: e.detail || 1,
          modifiers: modifiers(e),
        });
      }}
      onPointerMove={(e) => {
        const p = point(e);
        if (e.pointerType === "touch" && touch.current) {
          client.send("pointer", {
            kind: "mouseWheel",
            ...p,
            deltaX: touch.current.x - p.x,
            deltaY: touch.current.y - p.y,
          });
          touch.current = { ...touch.current, ...p };
          return;
        }
        client.send("pointer", {
          kind: "mouseMoved",
          ...p,
          button: pressed.current ? "left" : "none",
          buttons: e.buttons,
          modifiers: modifiers(e),
        });
      }}
      onPointerUp={(e) => {
        const p = point(e);
        if (e.pointerType === "touch") {
          const start = touch.current;
          touch.current = null;
          if (start && Math.hypot(start.startX - p.x, start.startY - p.y) < 6) {
            client.send("pointer", {
              kind: "mousePressed",
              ...p,
              button: "left",
              buttons: 1,
              clickCount: 1,
            });
            client.send("pointer", {
              kind: "mouseReleased",
              ...p,
              button: "left",
              buttons: 0,
              clickCount: 1,
            });
          }
          return;
        }
        pressed.current = 0;
        if (e.button !== 2)
          client.send("pointer", {
            kind: "mouseReleased",
            ...p,
            button: e.button === 1 ? "middle" : "left",
            buttons: e.buttons,
            clickCount: e.detail || 1,
            modifiers: modifiers(e),
          });
      }}
      onPointerCancel={() => {
        touch.current = null;
        pressed.current = 0;
        client.send("pointer", {
          kind: "mouseReleased",
          x: 0,
          y: 0,
          button: "left",
          buttons: 0,
          clickCount: 1,
        });
      }}
    >
      <canvas ref={canvas} aria-label="Page web Chromium" />
      <textarea
        ref={input}
        className="native-browser-keyboard"
        aria-label="Saisie dans la page web"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={(e) => void key(e)}
        onKeyUp={(e) => void key(e, true)}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={(e) => {
          composing.current = false;
          client.send("text", { text: e.data });
          if (input.current) input.current.value = "";
        }}
        onInput={(e) => {
          if (!composing.current && e.currentTarget.value) {
            client.send("text", { text: e.currentTarget.value });
            e.currentTarget.value = "";
          }
        }}
        onPaste={(e) => {
          e.preventDefault();
          client.send("text", { text: e.clipboardData.getData("text/plain") });
        }}
      />
      {menu && (
        <div
          className="native-browser-context"
          style={{
            left: Math.min(menu.x, surface.current!.clientWidth - 190),
            top: Math.min(menu.y, surface.current!.clientHeight - 125),
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              void client
                .call("selection")
                .then((t) => navigator.clipboard.writeText(String(t)))
                .catch((e) => onError(e.message));
              setMenu(null);
            }}
          >
            Copier la sélection
          </button>
          <button
            onClick={() => {
              void navigator.clipboard
                .readText()
                .then((text) => client.call("text", { text }))
                .catch((e) => onError(e.message));
              setMenu(null);
            }}
          >
            Coller
          </button>
          <button
            onClick={() => {
              void client.call("reload");
              setMenu(null);
            }}
          >
            Recharger
          </button>
        </div>
      )}
      {dialog && (
        <div
          className="native-browser-modal"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div>
            <h3>
              {dialog.type === "alert"
                ? "Message de la page"
                : "La page demande une réponse"}
            </h3>
            <p>{String(dialog.message ?? "")}</p>
            {dialog.type === "prompt" && (
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoFocus
              />
            )}
            <footer>
              <button
                onClick={() => {
                  void client.call("dialog", { accept: false });
                  onDialogClose();
                }}
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  void client.call("dialog", { accept: true, text: prompt });
                  onDialogClose();
                }}
              >
                OK
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};
