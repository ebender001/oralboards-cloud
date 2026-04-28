const STOP_WORDS = new Set([
  "a", "an", "the", "of", "and", "or", "to", "for", "with", "without",
  "in", "on", "at", "by", "from", "into", "over", "under", "after",
  "before", "during", "through", "via", "as", "is", "are", "be"
]);

const TOKEN_EQUIVALENTS = {
  esophageal: "esophagus",
  oesophageal: "esophagus",
  esophagus: "esophagus",
  perforated: "perforation",
  perforate: "perforation",
  ruptured: "rupture",
  ruptureds: "rupture",
  rupturing: "rupture",
  pulmonary: "lung",
  pulmonic: "lung",
  pleural: "pleura",
  gastric: "stomach",
  abdominal: "abdomen",
  thoracic: "chest",
  mediastinal: "mediastinum",
  septic: "sepsis",
  septicemia: "sepsis",
  haemorrhage: "hemorrhage",
  haemorrhagic: "hemorrhage",
  haemodynamic: "hemodynamic",
  haemodynamically: "hemodynamic",
  hypotensive: "hypotension",
  hypotension: "hypotension",
  tachycardia: "tachycardia",
  tachycardic: "tachycardia",
  dyspnea: "shortness of breath",
  dyspnoea: "shortness of breath",
  haemoptysis: "hemoptysis"
};

const NEGATION_TERMS = new Set([
  "no", "not", "without", "absent", "negative", "denies", "denied", "rule", "ruled"
]);

const NEGATION_WINDOW = 4;

function normalizeTextForScoring(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToken(token = "") {
  const cleaned = String(token).toLowerCase().trim();
  if (!cleaned) return "";

  const singular = cleaned.endsWith("s") && cleaned.length > 3
    ? cleaned.slice(0, -1)
    : cleaned;

  return TOKEN_EQUIVALENTS[singular] || singular;
}

function conceptTokens(text = "") {
  return normalizeTextForScoring(text)
    .split(" ")
    .map(normalizeToken)
    .filter((token) => token && !STOP_WORDS.has(token));
}

function uniqueConceptTokens(text = "") {
  return [...new Set(conceptTokens(text))];
}

function buildScoringCatalog(oralCase) {
  return {
    mustCoverPoints: oralCase.get("mustCoverPoints") || [],
    majorErrors: oralCase.get("criticalErrorsMajor") || [],
    minorErrors: oralCase.get("criticalErrorsMinor") || []
  };
}

function phraseTokens(text = "") {
  return normalizeTextForScoring(text)
    .split(" ")
    .filter(Boolean);
}

function isNegatedPhrase(rawText = "", phrase = "") {
  const normalizedText = normalizeTextForScoring(rawText);
  const normalizedPhrase = normalizeTextForScoring(phrase);
  if (!normalizedText || !normalizedPhrase || !normalizedText.includes(normalizedPhrase)) {
    return false;
  }

  const textTokens = phraseTokens(normalizedText);
  const phraseTokensList = phraseTokens(normalizedPhrase);
  if (!phraseTokensList.length) {
    return false;
  }

  for (let i = 0; i <= textTokens.length - phraseTokensList.length; i++) {
    let matchesPhrase = true;
    for (let j = 0; j < phraseTokensList.length; j++) {
      if (textTokens[i + j] !== phraseTokensList[j]) {
        matchesPhrase = false;
        break;
      }
    }

    if (!matchesPhrase) continue;

    const start = Math.max(0, i - NEGATION_WINDOW);
    const end = Math.min(textTokens.length, i + phraseTokensList.length + NEGATION_WINDOW);
    const nearbyTokens = textTokens.slice(start, end);

    if (nearbyTokens.some((token) => NEGATION_TERMS.has(token))) {
      return true;
    }

    const negativePatterns = [
      /no evidence of/, 
      /negative for/, 
      /rule(?:d)? out/, 
      /without evidence of/, 
      /absent evidence of/
    ];

    const contextWindow = normalizedText.slice(
      Math.max(0, normalizedText.indexOf(normalizedPhrase) - 60),
      Math.min(normalizedText.length, normalizedText.indexOf(normalizedPhrase) + normalizedPhrase.length + 60)
    );

    if (negativePatterns.some((pattern) => pattern.test(contextWindow))) {
      return true;
    }
  }

  return false;
}

function matchCanonicalLabel(rawItem, allowedLabels = []) {
  if (!rawItem || !allowedLabels.length) return null;

  const rawNormalized = normalizeTextForScoring(rawItem);
  const rawTokens = uniqueConceptTokens(rawItem);
  if (!rawTokens.length) return null;

  let bestLabel = null;
  let bestScore = 0;

  for (const label of allowedLabels) {
    if (isNegatedPhrase(rawItem, label)) {
      continue;
    }

    const labelNormalized = normalizeTextForScoring(label);
    if (rawNormalized === labelNormalized || rawNormalized.includes(labelNormalized)) {
      return label;
    }

    const labelTokens = uniqueConceptTokens(label);
    if (!labelTokens.length) continue;

    const overlap = labelTokens.filter((token) => rawTokens.includes(token)).length;
    const score = overlap / labelTokens.length;

    if (score > bestScore) {
      bestScore = score;
      bestLabel = label;
    }
  }

  return bestScore >= 0.75 ? bestLabel : null;
}

function normalizeModelItems(items = [], allowedLabels = []) {
  return (items || [])
    .map((item) => matchCanonicalLabel(item, allowedLabels))
    .filter(Boolean);
}

function detectConceptMentions(candidateResponse, allowedLabels = []) {
  const responseTokens = uniqueConceptTokens(candidateResponse);
  if (!responseTokens.length) return [];

  return allowedLabels.filter((label) => {
    if (isNegatedPhrase(candidateResponse, label)) {
      return false;
    }

    const labelTokens = uniqueConceptTokens(label);
    if (!labelTokens.length) return false;

    return labelTokens.every((token) => responseTokens.includes(token));
  });
}

module.exports = {
  buildScoringCatalog,
  matchCanonicalLabel,
  normalizeModelItems,
  detectConceptMentions,
};