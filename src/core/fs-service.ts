import { Context, Effect, Layer } from "effect";
import { FileSystemError } from "./errors.ts";
import { VmService } from "./vm-service.ts";

export interface FsEntry {
  readonly name: string;
  readonly path: string;
  readonly isDir: boolean;
  readonly isSymlink: boolean;
  readonly size: number;
  readonly permissions: string;
  readonly mtime: string;
  readonly gitStatus?: string;
}

const sq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export interface GuestFsApi {
  readonly listDir: (dirPath: string) => Effect.Effect<readonly FsEntry[], FileSystemError>;
  readonly readFileText: (filePath: string) => Effect.Effect<string, FileSystemError>;
  readonly readFileBytes: (filePath: string) => Effect.Effect<Uint8Array, FileSystemError>;
  readonly writeFileText: (filePath: string, content: string) => Effect.Effect<void, FileSystemError>;
  readonly writeFileBytes: (filePath: string, bytes: Uint8Array) => Effect.Effect<void, FileSystemError>;
  readonly mkdir: (dirPath: string) => Effect.Effect<void, FileSystemError>;
  readonly remove: (targetPath: string) => Effect.Effect<void, FileSystemError>;
  readonly rename: (fromPath: string, toPath: string) => Effect.Effect<void, FileSystemError>;
}

export class GuestFsService extends Context.Tag("GuestFsService")<GuestFsService, GuestFsApi>() {}

export const GuestFsLive = Layer.effect(
  GuestFsService,
  Effect.gen(function* () {
    const vm = yield* VmService;

    const mapErr = (path: string, operation: string) => (err: unknown) =>
      new FileSystemError({
        path,
        operation,
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      });

    return {
      listDir: (dirPath) =>
        Effect.gen(function* () {
          const clean = dirPath || "/home/user";
          // Portable stat/ls format working identically on both Alpine BusyBox and Debian GNU coreutils
          const cmd = `
cd ${sq(clean)} 2>/dev/null || exit 2
for f in * .[!.]* ..?*; do
  [ -e "$f" ] || [ -L "$f" ] || continue
  t="f"
  [ -d "$f" ] && t="d"
  l="0"
  [ -L "$f" ] && l="1"
  sz=$(wc -c < "$f" 2>/dev/null || echo 0)
  [ "$t" = "d" ] && sz=0
  perm=$(ls -ld "$f" 2>/dev/null | awk '{print $1}')
  mt=$(ls -ld "$f" 2>/dev/null | awk '{print $6" "$7" "$8}')
  printf '%s\\t%s\\t%s\\t%s\\t%s\\t%s\\n' "$t" "$l" "$sz" "$perm" "$mt" "$f"
done
          `.trim();
          const res = yield* vm.execShell(cmd).pipe(Effect.mapError(mapErr(clean, "listDir")));
          if (res.exitCode !== 0) {
            return yield* Effect.fail(
              new FileSystemError({
                path: clean,
                operation: "listDir",
                message: res.stderr || `Cannot open directory ${clean}`,
              })
            );
          }

          // Optional git status badges if inside a git repository
          const gitMap = new Map<string, string>();
          const gitRes = yield* vm
            .execShell(`cd ${sq(clean)} && command -v git >/dev/null 2>&1 && git status --porcelain --untracked-files=normal . 2>/dev/null`)
            .pipe(Effect.either);
          if (gitRes._tag === "Right" && gitRes.right.exitCode === 0) {
            for (const line of gitRes.right.stdout.split("\n")) {
              if (line.length < 4) continue;
              const code = line.slice(0, 2).trim();
              const rel = line.slice(3).trim().split("/")[0];
              if (rel) gitMap.set(rel, code);
            }
          }

          const entries: FsEntry[] = [];
          const base = clean.endsWith("/") ? clean.slice(0, -1) : clean;
          for (const line of res.stdout.split("\n")) {
            if (!line.trim()) continue;
            const [t, l, sz, perm, mt, ...rest] = line.split("\t");
            const name = rest.join("\t");
            if (!name || name === "." || name === "..") continue;
            entries.push({
              name,
              path: `${base}/${name}`.replace(/\/+/g, "/"),
              isDir: t === "d",
              isSymlink: l === "1",
              size: Number(sz) || 0,
              permissions: perm || "",
              mtime: mt || "",
              gitStatus: gitMap.get(name),
            });
          }

          return entries.sort((a, b) => {
            if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
            return a.name.localeCompare(b.name);
          });
        }),

      readFileText: (filePath) =>
        vm.exec("cat", [filePath]).pipe(
          Effect.mapError(mapErr(filePath, "readFileText")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.succeed(r.stdout)
              : Effect.fail(
                  new FileSystemError({
                    path: filePath,
                    operation: "readFileText",
                    message: r.stderr || `Read failed (exit ${r.exitCode})`,
                  })
                )
          )
        ),

      readFileBytes: (filePath) =>
        vm.exec("cat", [filePath], { encoding: "buffer" }).pipe(
          Effect.mapError(mapErr(filePath, "readFileBytes")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.succeed(r.stdout as unknown as Uint8Array)
              : Effect.fail(
                  new FileSystemError({
                    path: filePath,
                    operation: "readFileBytes",
                    message: String(r.stderr) || `Read failed (exit ${r.exitCode})`,
                  })
                )
          )
        ),

      writeFileText: (filePath, content) =>
        vm.exec("/bin/sh", ["-c", `cat > ${sq(filePath)}`], { input: content }).pipe(
          Effect.mapError(mapErr(filePath, "writeFileText")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.void
              : Effect.fail(
                  new FileSystemError({
                    path: filePath,
                    operation: "writeFileText",
                    message: r.stderr || `Write failed`,
                  })
                )
          )
        ),

      writeFileBytes: (filePath, bytes) =>
        vm.exec("/bin/sh", ["-c", `cat > ${sq(filePath)}`], { input: bytes }).pipe(
          Effect.mapError(mapErr(filePath, "writeFileBytes")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.void
              : Effect.fail(
                  new FileSystemError({
                    path: filePath,
                    operation: "writeFileBytes",
                    message: r.stderr || `Write failed`,
                  })
                )
          )
        ),

      mkdir: (dirPath) =>
        vm.exec("mkdir", ["-p", dirPath]).pipe(
          Effect.mapError(mapErr(dirPath, "mkdir")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.void
              : Effect.fail(new FileSystemError({ path: dirPath, operation: "mkdir", message: r.stderr }))
          )
        ),

      remove: (targetPath) =>
        vm.exec("rm", ["-rf", targetPath]).pipe(
          Effect.mapError(mapErr(targetPath, "remove")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.void
              : Effect.fail(new FileSystemError({ path: targetPath, operation: "remove", message: r.stderr }))
          )
        ),

      rename: (fromPath, toPath) =>
        vm.exec("mv", [fromPath, toPath]).pipe(
          Effect.mapError(mapErr(fromPath, "rename")),
          Effect.flatMap((r) =>
            r.exitCode === 0
              ? Effect.void
              : Effect.fail(new FileSystemError({ path: fromPath, operation: "rename", message: r.stderr }))
          )
        ),
    };
  })
);
