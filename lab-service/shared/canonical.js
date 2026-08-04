// RFC 8785 JSON Canonicalization Scheme (JCS).
//
// Beacon signs the canonical form of a receipt, not its JSON pretty-print.
// That lets two implementations sign and verify the same logical receipt
// even if their JSON serializers differ in whitespace, key order, or
// number formatting.
//
// This implementation handles the cases Beacon actually emits:
//   • objects with string keys (sorted by code-point, recursively),
//   • arrays (order preserved),
//   • strings (JSON string escaping per RFC 8259 with the JCS tweaks),
//   • numbers (finite, serialized per JCS — integers and ECMAScript
//     ToString for the rest),
//   • booleans, null.
//
// It refuses to canonicalize non-finite numbers and undefined values.

const HEX = "0123456789abcdef";

export function canonicalize(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return encodeString(value);
  if (typeof value === "number") return encodeNumber(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys
        .map((k) => encodeString(k) + ":" + canonicalize(value[k]))
        .join(",") +
      "}"
    );
  }
  throw new Error(
    `canonicalize: unsupported value of type ${typeof value}`
  );
}

function encodeNumber(n) {
  if (!Number.isFinite(n)) {
    throw new Error("canonicalize: non-finite number rejected");
  }
  if (n === 0) return "0"; // collapse -0
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return n.toString();
  // ECMAScript Number.prototype.toString matches JCS for the bulk of
  // floating point values Beacon will see. Receipts should avoid floats.
  return n.toString();
}

function encodeString(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 0x22) out += '\\"';
    else if (c === 0x5c) out += "\\\\";
    else if (c === 0x08) out += "\\b";
    else if (c === 0x09) out += "\\t";
    else if (c === 0x0a) out += "\\n";
    else if (c === 0x0c) out += "\\f";
    else if (c === 0x0d) out += "\\r";
    else if (c < 0x20) {
      out +=
        "\\u00" +
        HEX[(c >> 4) & 0xf] +
        HEX[c & 0xf];
    } else {
      out += s[i];
    }
  }
  return out + '"';
}
