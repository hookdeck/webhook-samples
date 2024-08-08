const fs = require('fs');
const exec = require('child_process').execSync;

const topics = fs.readFileSync('topics.txt', 'utf8').split(',');
const MAX_TOPICS = topics.length;
const BASE_URL = 'https://hkdk.events/event_path';
const WEBHOOK_URL = `${BASE_URL}/shopify/2024-10`;
const SHOPIFY_APP_PATH = 'path/to/shopify/app/directory';

let index = 0;
const triggerNextWebhook = () => {
  const topic = topics[index];

  console.log(`[${index+1}/${topics.length}] Triggering "${topic}" webhook`);

  try {
    exec(`shopify app webhook trigger --address ${WEBHOOK_URL} --topic ${topic} --api-version 2024-10 --path ${SHOPIFY_APP_PATH}`);
  } catch (e) {
    if(e.toString().includes('topic pair')) {
      console.warn(`No webhook for "${topic}". Skipping.`);
    } else {
      console.error(`Error triggering webhook for "${topic}"`, e);
      process.exit(1);
    }
  }

  if(index < MAX_TOPICS) {
    ++index;
    setTimeout(triggerNextWebhook, 250);
  }
  else {
    console.log('All webhooks triggered');
  }
}

triggerNextWebhook();