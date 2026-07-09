import { spawn } from "node:child_process";

const steps = [
  ["scrape:raw", ["run", "scrape:raw"]],
  ["merge", ["run", "merge"]],
  ["enrich:api", ["run", "enrich:api"]]
];

for (const [name, args] of steps) {
  console.log(`\n== ${name} ==`);
  await run("npm", args);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}
