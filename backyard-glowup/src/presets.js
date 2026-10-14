// Upgrade catalog for the two modes. Each upgrade carries the phrase that gets
// dropped into the image prompt, so adding a new upgrade is a single entry here.

const KEEP_RULES =
  'Keep the exact same camera angle, perspective, lighting direction, house, fences, ' +
  'and sky. Only change the parts of the yard described below. Photorealistic, ' +
  'natural daylight, no people, no text, no watermarks.';

export const MODES = {
  cleanup: {
    id: 'cleanup',
    label: 'Cleanup',
    blurb: 'A quick tidy-up. Small upgrades that make the yard look cared for this weekend.',
    upgrades: [
      { id: 'mow', label: 'Mow and edge the lawn', prompt: 'a freshly mowed, evenly green lawn with crisp edges' },
      { id: 'debris', label: 'Clear leaves and debris', prompt: 'all leaves, sticks, and debris removed from the lawn and beds' },
      { id: 'hedges', label: 'Trim hedges and shrubs', prompt: 'neatly trimmed hedges and shrubs with clean shapes' },
      { id: 'mulch', label: 'Fresh mulch in beds', prompt: 'freshly laid dark mulch in the garden beds' },
      { id: 'patio', label: 'Sweep and pressure-wash patio', prompt: 'a clean, swept, pressure-washed patio' },
      { id: 'lights', label: 'String lights', prompt: 'warm string lights hung across the patio' },
    ],
    defaultUpgrades: ['mow', 'debris', 'hedges'],
  },
  glowup: {
    id: 'glowup',
    label: 'Glow Up',
    blurb: 'A full transformation. Big changes like a new deck, a pergola, or a fire pit.',
    upgrades: [
      { id: 'deck', label: 'New composite deck', prompt: 'a new composite deck with a built-in bench and wide steps, replacing any existing patio or deck' },
      { id: 'pergola', label: 'Pergola with climbing plants', prompt: 'a cedar pergola covered in climbing vines and soft shade' },
      { id: 'firepit', label: 'Stone fire pit with seating', prompt: 'a round stone fire pit surrounded by comfortable outdoor seating' },
      { id: 'beds', label: 'Raised garden beds', prompt: 'raised garden beds built from warm wood, filled with flowering plants' },
      { id: 'fence', label: 'Privacy fence and screening', prompt: 'a new privacy fence with horizontal slats and tall screening plants' },
      { id: 'kitchen', label: 'Outdoor kitchen counter', prompt: 'a built-in outdoor kitchen counter with a grill and stone countertop' },
      { id: 'pool', label: 'Small plunge pool', prompt: 'a small rectangular plunge pool with a stone surround' },
    ],
    defaultUpgrades: ['deck', 'pergola', 'firepit'],
  },
};

export const STYLES = {
  modern: { label: 'Modern', prompt: 'clean modern design with straight lines, neutral tones, and minimal planting' },
  cottage: { label: 'Cottage', prompt: 'cozy cottage style with lush flowers, soft colors, and weathered wood' },
  rustic: { label: 'Rustic', prompt: 'rustic farmhouse style with natural stone, reclaimed wood, and earthy tones' },
  tropical: { label: 'Tropical', prompt: 'tropical resort style with palms, bold greenery, and warm teak furniture' },
};

// Builds the full edit prompt for the image model. Only upgrades that belong to
// the chosen mode are accepted, so a cleanup can't quietly become a deck build.
export function buildPrompt({ mode, upgradeIds, style }) {
  const catalog = MODES[mode];
  if (!catalog) throw new Error(`Unknown mode: ${mode}`);

  if (upgradeIds.some((id) => !catalog.upgrades.some((u) => u.id === id))) {
    throw new Error(`Upgrade not valid for ${catalog.label} mode`);
  }
  const chosen = catalog.upgrades.filter((u) => upgradeIds.includes(u.id));
  if (chosen.length === 0) throw new Error('Pick at least one upgrade');

  const styleText = STYLES[style]?.prompt;
  const parts = [
    `Edit this backyard photo to show the following changes: ${chosen.map((u) => u.prompt).join('; ')}.`,
  ];
  if (styleText) parts.push(`Style: ${styleText}.`);
  parts.push(KEEP_RULES);
  return parts.join(' ');
}
