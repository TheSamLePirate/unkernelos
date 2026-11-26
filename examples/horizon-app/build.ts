// bun run examples/horizon-app/build.ts [/absolute/output.html]
const destination = process.argv[2] ?? "/tmp/unkernel-counter-bun.html";
await Bun.write(
  destination,
  await Bun.file(new URL("./counter.html", import.meta.url)).text(),
);
console.log(
  JSON.stringify({
    id: "counter-bun",
    title: "Compteur Bun",
    guestPath: destination,
    open: true,
  }),
);
