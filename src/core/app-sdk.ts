/** Injected into sandboxed agent-built apps. No build tool or framework is required. */
export function sdkPrelude(token: string) {
  return `<script>(${appSdkBootstrap.toString()})(${JSON.stringify(token)});<\/script>`;
}
function appSdkBootstrap(token: string) {
  const pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  let sequence = 0,
    revision = 0;
  let definition: any = null;
  const send = (value: Record<string, unknown>) =>
    parent.postMessage({ ...value, token }, "*");
  const publish = () => {
    if (!definition) return;
    const actions = Object.entries(definition.actions ?? {}).map(
      ([name, value]: [string, any]) => ({
        name,
        label: value.label ?? name,
        paramsSchema: value.paramsSchema ?? { type: "object", properties: {} },
      }),
    );
    send({
      __unkernelos_surface: true,
      surface: {
        revision: String(++revision),
        state: definition.getState?.() ?? {},
        dock: definition.getDock?.(),
        title: definition.title,
        document: definition.document,
        status: definition.getStatus?.() ?? "live",
        actions,
      },
    });
  };
  const invoke = async (name: string, args: Record<string, unknown> = {}) => {
    if (
      !definition ||
      !Object.prototype.hasOwnProperty.call(definition.actions ?? {}, name)
    )
      throw new Error("Unknown app action: " + name);
    try {
      return await definition.actions[name].run(args);
    } finally {
      publish();
    }
  };
  window.addEventListener("message", async (ev) => {
    if (ev.source !== parent || ev.data?.token !== token) return;
    const data = ev.data;
    if (data.__unkernelos_reply) {
      const p = pending.get(data.id);
      if (!p) return;
      pending.delete(data.id);
      clearTimeout(p.timer);
      data.ok
        ? p.resolve(data.result)
        : p.reject(new Error(data.error ?? "OS API error"));
    }
    if (data.__unkernelos_action) {
      try {
        const result = await invoke(data.action, data.args ?? {});
        send({
          __unkernelos_action_reply: true,
          id: data.id,
          ok: true,
          result,
        });
      } catch (error) {
        send({
          __unkernelos_action_reply: true,
          id: data.id,
          ok: false,
          error: String(error),
        });
      }
    }
  });
  (window as any).unkernelOS = {
    call: (method: string, params: Record<string, unknown> = {}) =>
      new Promise((resolve, reject) => {
        const id = "call-" + ++sequence;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error("OS API timeout"));
        }, 30000);
        pending.set(id, { resolve, reject, timer });
        send({ __unkernelos_call: true, id, method, params });
      }),
    app: {
      define: (value: any) => {
        definition = value;
        publish();
        return { publish, invoke };
      },
      publish,
      invoke,
      version: 1,
    },
  };
}
