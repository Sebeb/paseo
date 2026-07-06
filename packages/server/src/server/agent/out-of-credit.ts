const OUT_OF_CREDIT_PATTERNS = [
  /\b(out of|run out of|ran out of|insufficient|not enough)\s+(credits?|credit balance|quota|usage|balance)\b/i,
  /\bno\s+(credits?|credit balance|quota|balance)\b/i,
  /\bno\s+usage\s+(remaining|left|available)\b/i,
  /\b(credits?|quota|usage|balance)\s+(exhausted|depleted|exceeded|used up|has run out|ran out)\b/i,
  /\b(hit|reached)\s+(your|the)\s+(usage|credit|quota|rate)\s+limit\b/i,
  /\b(resource_exhausted|insufficient_quota|insufficient_balance|billing_hard_limit_reached)\b/i,
  /\b(add billing|add credits?|buy credits?|purchase credits?|upgrade (your )?(plan|account))\b/i,
];

export function isOutOfCreditMessage(text: string): boolean {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return false;
  }
  return OUT_OF_CREDIT_PATTERNS.some((pattern) => pattern.test(normalized));
}
