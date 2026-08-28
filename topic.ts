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
    current = current[is_array ? segment.slice(0, -2) : segment];

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
