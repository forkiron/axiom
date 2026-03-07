import fs from 'node:fs';
import path from 'node:path';
import { BackboardClient } from 'backboard-sdk';

const DEFAULT_ASSISTANT_NAME = 'Canstandard CSV Assistant';
const DEFAULT_SYSTEM_PROMPT =
  'You answer questions using uploaded CSV data. Use only uploaded data and say when data is missing.';
const DEFAULT_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_WAIT_INTERVAL_MS = 3000;

function parseArgs(argv) {
  const options = {
    mode: 'upload',
    assistantId: undefined,
    assistantName: DEFAULT_ASSISTANT_NAME,
    systemPrompt: undefined,
    csvFiles: [],
    wait: true,
    waitTimeoutMs: DEFAULT_WAIT_TIMEOUT_MS,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--assistant-id') {
      options.assistantId = argv[i + 1];
      i += 1;
    } else if (arg === '--status') {
      options.mode = 'status';
    } else if (arg === '--assistant-name') {
      options.assistantName = argv[i + 1] ?? DEFAULT_ASSISTANT_NAME;
      i += 1;
    } else if (arg === '--system-prompt') {
      options.systemPrompt = argv[i + 1];
      i += 1;
    } else if (arg === '--csv') {
      const value = argv[i + 1];
      if (value) options.csvFiles.push(value);
      i += 1;
    } else if (arg === '--wait') {
      options.wait = true;
    } else if (arg === '--no-wait') {
      options.wait = false;
    } else if (arg === '--wait-timeout-ms') {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.waitTimeoutMs = parsed;
      }
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/upload-backboard-csv.mjs [options]

Options:
  --status                    Show document indexing status instead of uploading.
  --assistant-id <id>         Reuse an existing assistant.
  --assistant-name <name>     Name for a newly created assistant.
  --system-prompt <text>      System prompt for a newly created assistant.
  --csv <path>                CSV file to upload (repeatable).
  --wait                      Wait for indexing (default).
  --no-wait                   Do not wait for indexing.
  --wait-timeout-ms <ms>      Max wait time when --wait is enabled.
  -h, --help                  Show this help.
`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function discoverCsvFiles(rootDir, skipDirs = new Set(['.git', '.next', 'node_modules'])) {
  const out = [];

  function walk(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.csv')) {
        out.push(fullPath);
      }
    }
  }

  walk(rootDir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

function normalizeCsvPaths(csvFiles) {
  return csvFiles.map((filePath) => path.resolve(process.cwd(), filePath));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilIndexed(client, documentId, timeoutMs) {
  const started = Date.now();
  let lastStatus = 'unknown';
  while (Date.now() - started < timeoutMs) {
    const doc = await client.getDocumentStatus(documentId);
    lastStatus = doc.status ?? lastStatus;
    if (doc.status === 'indexed') return doc;
    if (doc.status === 'failed') {
      throw new Error(
        `Document ${documentId} failed to process${doc.statusMessage ? `: ${doc.statusMessage}` : ''}`
      );
    }
    await sleep(DEFAULT_WAIT_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for document ${documentId} to index (last status: ${lastStatus})`);
}

async function ensureAssistantId(client, options) {
  if (options.assistantId) return options.assistantId;
  if (process.env.BACKBOARD_ASSISTANT_ID) return process.env.BACKBOARD_ASSISTANT_ID;

  const created = await client.createAssistant({
    name: options.assistantName,
    system_prompt: options.systemPrompt ?? process.env.BACKBOARD_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
  });
  return created.assistantId;
}

function resolveExistingAssistantId(options) {
  return options.assistantId ?? process.env.BACKBOARD_ASSISTANT_ID ?? null;
}

async function printStatus(client, assistantId) {
  const docs = await client.listAssistantDocuments(assistantId);
  const csvDocs = docs.filter((doc) => (doc.filename ?? '').toLowerCase().endsWith('.csv'));

  console.log(`assistantId=${assistantId}`);
  console.log(`csvDocuments=${csvDocs.length}`);

  if (csvDocs.length === 0) {
    console.log('No CSV documents found on this assistant.');
    return;
  }

  for (const doc of csvDocs) {
    console.log(`- ${doc.documentId} (${doc.filename}) status=${doc.status}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  loadEnvFile(path.resolve(process.cwd(), '.env.local'));
  loadEnvFile(path.resolve(process.cwd(), '.env'));

  const apiKey = process.env.BACKBOARD_API_KEY;
  if (!apiKey) {
    throw new Error('Missing BACKBOARD_API_KEY. Set it in your environment or .env.local.');
  }

  const client = new BackboardClient({ apiKey });

  if (options.mode === 'status') {
    const assistantId = resolveExistingAssistantId(options);
    if (!assistantId) {
      throw new Error('Status mode requires --assistant-id or BACKBOARD_ASSISTANT_ID in environment.');
    }
    await printStatus(client, assistantId);
    return;
  }

  const csvPaths =
    options.csvFiles.length > 0
      ? normalizeCsvPaths(options.csvFiles)
      : discoverCsvFiles(process.cwd());

  if (csvPaths.length === 0) {
    throw new Error('No CSV files found to upload.');
  }

  for (const csvPath of csvPaths) {
    if (!fs.existsSync(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }
  }

  const assistantId = await ensureAssistantId(client, options);

  console.log(`Using assistant: ${assistantId}`);
  console.log(`Uploading ${csvPaths.length} CSV file(s)...`);

  const uploaded = [];
  for (let i = 0; i < csvPaths.length; i += 1) {
    const filePath = csvPaths[i];
    const rel = path.relative(process.cwd(), filePath);
    const doc = await client.uploadDocumentToAssistant(assistantId, filePath);
    console.log(
      `[${i + 1}/${csvPaths.length}] Uploaded ${rel} -> documentId=${doc.documentId} status=${doc.status}`
    );

    if (options.wait) {
      const finalDoc = await waitUntilIndexed(client, doc.documentId, options.waitTimeoutMs);
      console.log(
        `  Indexed ${rel} -> documentId=${finalDoc.documentId} status=${finalDoc.status}`
      );
      uploaded.push(finalDoc);
    } else {
      uploaded.push(doc);
    }
  }

  console.log('\nUpload complete.');
  console.log(`assistantId=${assistantId}`);
  console.log('documents=');
  for (const doc of uploaded) {
    console.log(`- ${doc.documentId} (${doc.filename}) status=${doc.status}`);
  }

  if (!process.env.BACKBOARD_ASSISTANT_ID) {
    console.log('\nNext step: set BACKBOARD_ASSISTANT_ID in .env.local to this assistantId.');
  }
}

main().catch((error) => {
  console.error('Upload failed:', error?.message ?? error);
  process.exitCode = 1;
});
