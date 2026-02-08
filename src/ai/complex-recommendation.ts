import masterComplexes from './data/master-complexes.json';
import complexDescriptions from './data/complex-descriptions.json';

export type ComplexRecommendation = {
  master: string;
  title: string;
  discount: number;
  description: string;
};

type ComplexEntry = { title: string; discount: number };
type MasterComplexes = { master: string; complexes: ComplexEntry[] };

type DescriptionEntry = { title: string; description: string };

const normalizedMasters = (masterComplexes as MasterComplexes[]).map((item) => ({
  name: item.master,
  key: normalize(item.master),
}));

const complexesByMaster = new Map(
  (masterComplexes as MasterComplexes[]).map((item) => [normalize(item.master), item.complexes]),
);

const descriptionsByTitle = new Map(
  (complexDescriptions as DescriptionEntry[]).map((item) => [normalize(item.title), item.description]),
);

export function buildComplexRecommendation(
  input: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  previous: ComplexRecommendation | null,
): ComplexRecommendation | null {
  const masterMatch = detectMaster(input, history);
  if (!masterMatch) {
    return null;
  }

  if (previous && isSameMaster(previous, masterMatch)) {
    return previous;
  }

  const complexes =
    masterMatch.type === 'specific'
      ? complexesByMaster.get(normalize(masterMatch.name))
      : flattenAllComplexes();

  if (!complexes || complexes.length === 0) {
    return null;
  }

  const picked = complexes[Math.floor(Math.random() * complexes.length)];
  const description = descriptionsByTitle.get(normalize(picked.title));
  if (!description) {
    return null;
  }

  return {
    master: masterMatch.type === 'specific' ? masterMatch.name : 'любой мастер',
    title: picked.title,
    discount: picked.discount,
    description,
  };
}

function detectMaster(
  input: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
): { type: 'specific'; name: string } | { type: 'any' } | null {
  const fromInput = matchMasterName(input);
  if (fromInput?.type === 'specific') {
    return fromInput;
  }
  if (fromInput?.type === 'any') {
    return fromInput;
  }

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const item = history[i];
    if (item.role !== 'assistant') {
      continue;
    }
    const extracted = extractMasterFromText(item.content);
    if (extracted?.type === 'specific') {
      return extracted;
    }
    if (extracted?.type === 'any') {
      return extracted;
    }
  }

  return null;
}

function matchMasterName(
  text: string,
): { type: 'specific'; name: string } | { type: 'any' } | null {
  const lower = normalize(text);
  if (!lower) {
    return null;
  }
  if (isAnyMaster(lower)) {
    return { type: 'any' };
  }

  for (const master of normalizedMasters) {
    if (lower.includes(master.key)) {
      return { type: 'specific', name: master.name };
    }
  }

  return null;
}

function extractMasterFromText(
  text: string,
): { type: 'specific'; name: string } | { type: 'any' } | null {
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (!line.startsWith('Мастер:')) {
      continue;
    }
    const value = line.slice('Мастер:'.length).trim();
    if (!value || value === '?') {
      return null;
    }
    if (isAnyMaster(value)) {
      return { type: 'any' };
    }
    return { type: 'specific', name: value };
  }

  return null;
}

function isAnyMaster(value: string): boolean {
  const lower = normalize(value);
  return (
    lower === 'любой' ||
    lower === 'любая' ||
    lower === 'любой мастер' ||
    lower === 'любая мастер' ||
    lower === 'любой мастер подойдет' ||
    lower === 'не важно' ||
    lower === 'неважно'
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isSameMaster(
  previous: ComplexRecommendation,
  masterMatch: { type: 'specific'; name: string } | { type: 'any' },
): boolean {
  if (masterMatch.type === 'any') {
    return normalize(previous.master) === 'любой мастер';
  }
  return normalize(previous.master) === normalize(masterMatch.name);
}

function flattenAllComplexes(): ComplexEntry[] {
  const items: ComplexEntry[] = [];
  for (const complexes of complexesByMaster.values()) {
    items.push(...complexes);
  }
  return items;
}
