// Resolve a topic_identifier against a headers or body object.
//
// Most identifiers are a plain key ("x-shopify-topic", "event"), but many
// providers nest the event type ("data.type", "events[].eventType"), so a
// flat lookup alone leaves those captures named "untitled-<hash>".
//
// Supported forms:
//   event                       a plain key
//   data.type                   a dotted path
//   events[].eventType          an array segment; the first element is used
//   entry[].changes[].field     nested array segments
//   [].type                     a top-level array; an empty name before []
//                               means the current value itself
//
// A literal key that exists is preferred over path interpretation, so a header
// whose real name contains a dot still resolves.
export const resolveTopic = (
  source: any,
  identifier: string
): string | undefined => {
  if (source == null) return undefined;

  if (typeof source === "object" && source[identifier] !== undefined) {
    return scalarOrUndefined(source[identifier]);
  }

  let current = source;
  for (const segment of identifier.split(".")) {
    if (current == null) return undefined;

    const is_array = segment.endsWith("[]");
    const key = is_array ? segment.slice(0, -2) : segment;
    // "[]" with no name indexes the current value, so "[].type" reads a body
    // that is itself an array.
    if (!(is_array && key === "")) current = current[key];

    if (is_array) {
      if (!Array.isArray(current)) return undefined;
      current = current[0];
    }
  }

  return scalarOrUndefined(current);
};

// Only a scalar can name a file. Anything else means the path landed somewhere
// unintended, and falling back to "untitled-" is more honest than
// "[object Object]".
export const scalarOrUndefined = (value: any): string | undefined =>
  typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;

// The file stem for a topic, the same rule hookdeck/webhook-registry's generator
// uses for every sample it exports (safe_stem in generator/harvest_doc_examples.py):
// each run of characters outside [A-Za-z0-9._-] becomes one ".", and leading or
// trailing dots are dropped. A capture has to land on the doc sample's file name,
// otherwise it is written as a duplicate beside it ("soft bounce" -> soft.bounce,
// not "soft bounce"; a PubNub "...channel.created?v=1.0.0" -> "...channel.created.v.1.0.0").
export const safeStem = (topic: string): string =>
  topic.replace(/[^A-Za-z0-9._-]+/g, ".").replace(/^\.+|\.+$/g, "") || "_unnamed";
