// node examples/horizon-app/build.mjs [/absolute/output.html]
import { readFileSync, writeFileSync } from "node:fs";
const destination = process.argv[2] ?? "/tmp/unkernel-counter-node.html";
writeFileSync(
  destination,
  readFileSync(new URL("./counter.html", import.meta.url)),
);
console.log(
  JSON.stringify({
    id: "counter-node",
    title: "Compteur Node",
    guestPath: destination,
    open: true,
  }),
);
