import { defaultDatabasePath, resolveRuntimeKeys } from "../adapters/runtime-keys/src/index.js";

// Secret output is restricted to this explicitly invoked local operator command.
const keys = resolveRuntimeKeys({
  databasePath: defaultDatabasePath(),
  keysPath: process.env.ONTOLOGY_KEYS_PATH,
  apiKey: process.env.ONTOLOGY_API_KEY,
  encryptionKey: process.env.ONTOLOGY_ENCRYPTION_KEY,
});
process.stdout.write(`${keys.apiKey}\n`);
