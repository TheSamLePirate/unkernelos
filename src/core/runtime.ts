import { Effect, Layer, ManagedRuntime, Stream, SubscriptionRef } from "effect";
import { useEffect, useState } from "react";
import { GuestFsLive, GuestFsService } from "./fs-service.ts";
import { GithubAuthLive, GithubAuthService } from "./github-auth-service.ts";
import { GitLive, GitService } from "./git-service.ts";
import { SettingsLive, SettingsService } from "./settings.ts";
import { ToolchainLive, ToolchainService } from "./toolchain-service.ts";
import { VmLive, VmService, type OsEvent } from "./vm-service.ts";

const VmLayer = VmLive.pipe(Layer.provide(SettingsLive));
const GuestFsLayer = GuestFsLive.pipe(Layer.provide(VmLayer));
const ToolchainLayer = ToolchainLive.pipe(Layer.provide(VmLayer));
const GitLayer = GitLive.pipe(Layer.provide(Layer.mergeAll(VmLayer, SettingsLive)));
const GithubAuthLayer = GithubAuthLive.pipe(Layer.provide(Layer.mergeAll(VmLayer, SettingsLive)));

export const AppLayer = Layer.mergeAll(
  SettingsLive,
  VmLayer,
  GuestFsLayer,
  ToolchainLayer,
  GitLayer,
  GithubAuthLayer
);

export type AppContext =
  | SettingsService
  | VmService
  | GuestFsService
  | ToolchainService
  | GitService
  | GithubAuthService;

export const appRuntime = ManagedRuntime.make(AppLayer);

/**
 * React hook subscribing reactively to an Effect SubscriptionRef.
 */
export function useSubscriptionRef<A>(
  getRef: Effect.Effect<SubscriptionRef.SubscriptionRef<A>, never, AppContext>,
  initial: A
): A {
  const [value, setValue] = useState<A>(initial);

  useEffect(() => {
    let cancelled = false;
    const fiber = appRuntime.runFork(
      Effect.gen(function* () {
        const ref = yield* getRef;
        const current = yield* SubscriptionRef.get(ref);
        if (!cancelled) setValue(current);
        yield* Stream.runForEach(ref.changes, (next) =>
          Effect.sync(() => {
            if (!cancelled) setValue(next);
          })
        );
      })
    );
    return () => {
      cancelled = true;
      appRuntime.runFork(fiber.interruptAsFork(fiber.id()));
    };
  }, []);

  return value;
}

export function useOsEvents(handler: (ev: OsEvent) => void): void {
  useEffect(() => {
    let cancelled = false;
    const fiber = appRuntime.runFork(
      Effect.scoped(
        Effect.gen(function* () {
          const vm = yield* VmService;
          const stream = Stream.fromPubSub(vm.events);
          yield* Stream.runForEach(stream, (ev) =>
            Effect.sync(() => {
              if (!cancelled) handler(ev);
            })
          );
        })
      )
    );
    return () => {
      cancelled = true;
      appRuntime.runFork(fiber.interruptAsFork(fiber.id()));
    };
  }, [handler]);
}

export { SettingsService, VmService, GuestFsService, ToolchainService, GitService, GithubAuthService };
