const fs = require('fs');
const path = require('path');
const exec = require('child_process').execSync;

const API_VERSION = path.basename(__dirname);
const BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://hkdk.events/event_path';
const WEBHOOK_URL = `${BASE_URL}/shopify/${API_VERSION}`;
const SHOPIFY_APP_PATH = process.env.SHOPIFY_APP_PATH || 'path/to/shopify/app/directory';

const topics = fs
  .readFileSync(path.join(__dirname, 'topics.txt'), 'utf8')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);

if (!fs.existsSync(SHOPIFY_APP_PATH)) {
  console.error(
    `Shopify app path "${SHOPIFY_APP_PATH}" not found. Set SHOPIFY_APP_PATH to your app directory.`
  );
  process.exit(1);
}

console.log(
  `Triggering ${topics.length} topics at API version ${API_VERSION} -> ${WEBHOOK_URL}`
);

const skipped = [];
let index = 0;

const triggerNextWebhook = () => {
  const topic = topics[index];

  console.log(`[${index + 1}/${topics.length}] Triggering "${topic}" webhook`);

  try {
    exec(
      `shopify app webhook trigger --address ${WEBHOOK_URL} --topic ${topic} --api-version ${API_VERSION} --path ${SHOPIFY_APP_PATH}`
    );
  } catch (e) {
    if (e.toString().includes('topic pair')) {
      console.warn(`No webhook for "${topic}". Skipping.`);
      skipped.push(topic);
    } else {
      console.error(`Error triggering webhook for "${topic}"`, e);
      process.exit(1);
    }
  }

  if (index < topics.length - 1) {
    ++index;
    setTimeout(triggerNextWebhook, 250);
  } else {
    console.log(`All webhooks triggered. ${skipped.length} skipped.`);
    if (skipped.length) {
      console.log(skipped.join('\n'));
    }
  }
};

triggerNextWebhook();
