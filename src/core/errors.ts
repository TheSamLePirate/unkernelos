import { Data } from "effect";

export class KernelBootError extends Data.TaggedError("KernelBootError")<{
  readonly stage: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class KernelNotRunningError extends Data.TaggedError("KernelNotRunningError")<{
  readonly operation: string;
}> {}

export class GuestExecError extends Data.TaggedError("GuestExecError")<{
  readonly command: string;
  readonly exitCode: number;
  readonly stderr: string;
  readonly cause?: unknown;
}> {}

export class FileSystemError extends Data.TaggedError("FileSystemError")<{
  readonly path: string;
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class ToolchainError extends Data.TaggedError("ToolchainError")<{
  readonly tool: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class GitError extends Data.TaggedError("GitError")<{
  readonly operation: string;
  readonly message: string;
  readonly stderr?: string;
  readonly cause?: unknown;
}> {}

export class PreviewError extends Data.TaggedError("PreviewError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class SettingsError extends Data.TaggedError("SettingsError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}
