import { createKernel } from "unkernel/node";

const imgPath = process.argv[2];
if (!imgPath) {
  console.error("Usage: node scripts/verify-debian-image.ts <path/to/debian.erofs>");
  process.exit(1);
}

console.log(`[verify] Booting ${imgPath} inside unkernel.wasm...`);
const vm = await createKernel({
  distro: imgPath,
  memoryMiB: 1024,
  jit: true,
});

try {
  const res = await vm.exec("/bin/sh", [
    "-c",
    [
      'export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"',
      'echo "KERNEL=$(uname -a)"',
      'echo "GIT=$(git --version)"',
      'echo "GH=$(gh --version | head -n1)"',
      'echo "PYTHON=$(python3 --version)"',
      'echo "PIP=$(pip3 --version)"',
      'echo "NODE=$(node --version)"',
      'echo "NPM=$(npm --version)"',
      'echo "BUN=$(bun --version)"',
      'echo "PI=$(which pi)"',
      'echo "CLAUDE=$(claude --version)"',
      'echo "GFX=$(which eglinfo kmscube foot | tr "\\n" " ")"',
    ].join(" && "),
  ]);

  console.log(res.stdout);
  if (res.stderr) console.error(res.stderr);
  if (res.exitCode !== 0) {
    throw new Error(`Verification command exited with code ${res.exitCode}`);
  }
  console.log("[verify] All pre-installed tools verified inside unkernel.wasm!");
} finally {
  await vm.stop({ code: 0, reason: "verify-done" });
}
