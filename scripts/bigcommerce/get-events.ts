import * as cheerio from "cheerio";

const SERVER_BASE_URL = "http://localhost:9001";

interface BigCommerceEvent {
  scope: string;
  store_id: string;
  data: any;
}

async function getScopedEvents(
  url: string
): Promise<Record<string, BigCommerceEvent>> {
  console.log(`Fetching events from: ${url}`);
  // Fetch the webpage content
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP error! Status: ${response.status}`);
  }

  const html = await response.text();

  // Load the HTML into cheerio
  const $ = cheerio.load(html);

  // Find all pre elements
  const preElements = $("pre");

  // Extract and log the content of each pre element
  const eventExamples: BigCommerceEvent[] = [];
  preElements.each((index: number, element: cheerio.Element) => {
    const text = $(element).text();
    const strippedText = text
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trimEnd())
      .join("\n");
    try {
      const event: BigCommerceEvent = JSON.parse(strippedText);
      eventExamples.push(event);
    } catch (error) {
      console.error(`Error parsing JSON at element ${index + 1}:`, error);
    }
  });

  console.log(`Total pre elements found: ${eventExamples.length}`);

  // Extract unique scope values
  const scopeToExampleMap: Record<string, any> = {};
  eventExamples.forEach((event) => {
    if (event.scope && !scopeToExampleMap[event.scope]) {
      scopeToExampleMap[event.scope] = event;
    }
  });

  return scopeToExampleMap;
}

async function getAllEvents(): Promise<void> {
  const urls = [
    "https://developer.bigcommerce.com/docs/integrations/webhooks/events",
    "https://developer.bigcommerce.com/docs/integrations/webhooks/events/channels",
    "https://developer.bigcommerce.com/docs/integrations/webhooks/events/inventory-location",
  ];

  const allScopesSet: Record<string, BigCommerceEvent> = {};

  // Process each URL and collect unique scopes
  for (const url of urls) {
    const events = await getScopedEvents(url);
    Object.values(events).forEach(
      (event) => (allScopesSet[event.scope] = event)
    );
  }

  const today = new Date().toISOString().split("T")[0].slice(0, 7); // Format: YYYY-MM

  console.log(`Found ${Object.keys(allScopesSet).length} unique scopes`);

  // Make a POST request for each scope
  for (const [scope, event] of Object.entries(allScopesSet)) {
    try {
      const response = await fetch(`${SERVER_BASE_URL}/bigcommerce/${today}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
      });

      if (!response.ok) {
        console.error(
          `Error posting scope ${scope}: ${response.status} ${response.statusText}`
        );
      } else {
        console.log(`Successfully posted scope: ${scope}`);
      }
    } catch (error) {
      console.error(`Failed to post scope ${scope}:`, error);
    }
  }

  console.log("All scopes posted to server");
}

async function checkServerRunning(): Promise<boolean> {
  try {
    const response = await fetch(SERVER_BASE_URL, { method: "GET" });
    // A 404 indicates the server is running, even if the route doesn't exist
    if (response.status === 404) {
      return true;
    }
    return response.ok;
  } catch (error) {
    console.error("Server check failed:", error);
    return false;
  }
}

(async () => {
  if (!(await checkServerRunning())) {
    console.error("Error: Local server at localhost:9001 is not running");
    process.exit(1);
  } else {
    // Execute the function to get all events from all URLs
    getAllEvents();
  }
})();
