import { buildApp } from "./app.js";
import { currentDataFile } from "./store.js";

const port = Number(process.env.PORT ?? 3000);
const app = buildApp();
const dataFile = currentDataFile();
if (dataFile) app.log.info(`player store: ${dataFile}`);
app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
