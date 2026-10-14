// The two plans the app offers. Each item carries the phrase that gets dropped into
// the image prompt, so adding a new item is a single entry here.
//
// Glow Up items are products from your Amazon store. Put each product's link in `url`.
// Items without a link fall back to AMAZON_STORE_URL (your storefront page), and items
// with neither show "Link coming soon" in the app.

const KEEP_RULES =
  'Keep the exact same camera angle, perspective, lighting direction, house, fences, ' +
  'and sky. Only change the parts of the yard described above. Photorealistic, ' +
  'natural daylight, no people, no text, no watermarks.';

export const MODES = {
  glowup: {
    id: 'glowup',
    kind: 'shop',
    label: 'Glow Up',
    blurb: 'Shop the look. Products picked for your yard, ready to order from Amazon.',
    upgrades: [
      { id: 'lights', label: 'Outdoor string lights', prompt: 'warm outdoor string lights hung across the patio', url: '' },
      { id: 'seating', label: 'Patio conversation set', prompt: 'a patio conversation set with a loveseat, two armchairs, and a low coffee table on the patio', url: '' },
      { id: 'rug', label: 'Outdoor rug', prompt: 'a large patterned outdoor rug under the patio seating area', url: '' },
      { id: 'umbrella', label: 'Patio umbrella', prompt: 'a large market-style patio umbrella on the patio', url: '' },
      { id: 'planters', label: 'Planters with flowers', prompt: 'tall planters filled with flowers and greenery at the edges of the patio', url: '' },
      { id: 'firebowl', label: 'Fire pit bowl', prompt: 'a portable metal fire pit bowl with a small fire on the lawn', url: '' },
      { id: 'pathlights', label: 'Solar path lights', prompt: 'small solar path lights lining the edge of the lawn', url: '' },
      { id: 'hammock', label: 'Hammock with stand', prompt: 'a fabric hammock on a freestanding stand on the lawn', url: '' },
    ],
    defaultUpgrades: ['lights', 'seating', 'planters'],
  },
  glowupplus: {
    id: 'glowupplus',
    kind: 'contractor',
    label: 'Glow Up Plus',
    blurb: 'Done for you. A local contractor builds the whole transformation.',
    upgrades: [
      { id: 'landscaping', label: 'New sod and landscaping', prompt: 'a brand-new sod lawn, all debris cleared, and neatly trimmed, freshly landscaped beds and hedges' },
      { id: 'deck', label: 'New composite deck', prompt: 'a new composite deck with a built-in bench and wide steps, replacing any existing patio or deck' },
      { id: 'pergola', label: 'Pergola with climbing plants', prompt: 'a cedar pergola covered in climbing vines and soft shade' },
      { id: 'firepit', label: 'Stone fire pit with seating', prompt: 'a round stone fire pit surrounded by comfortable outdoor seating' },
      { id: 'beds', label: 'Raised garden beds', prompt: 'raised garden beds built from warm wood, filled with flowering plants' },
      { id: 'fence', label: 'Privacy fence and screening', prompt: 'a new privacy fence with horizontal slats and tall screening plants' },
      { id: 'kitchen', label: 'Outdoor kitchen counter', prompt: 'a built-in outdoor kitchen counter with a grill and stone countertop' },
      { id: 'pool', label: 'Small plunge pool', prompt: 'a small rectangular plunge pool with a stone surround' },
    ],
    defaultUpgrades: ['landscaping', 'deck', 'pergola', 'firepit'],
  },
};

export const STYLES = {
  modern: { label: 'Modern', prompt: 'clean modern design with straight lines, neutral tones, and minimal planting' },
  cottage: { label: 'Cottage', prompt: 'cozy cottage style with lush flowers, soft colors, and weathered wood' },
  rustic: { label: 'Rustic', prompt: 'rustic farmhouse style with natural stone, reclaimed wood, and earthy tones' },
  tropical: { label: 'Tropical', prompt: 'tropical resort style with palms, bold greenery, and warm teak furniture' },
};

// The plan list as the app sees it: no prompt text, and every Glow Up item gets its
// shopping link (or the storefront fallback, or null when there is neither).
export function publicModes({ storeUrl = '' } = {}) {
  return Object.values(MODES).map((mode) => ({
    id: mode.id,
    kind: mode.kind,
    label: mode.label,
    blurb: mode.blurb,
    upgrades: mode.upgrades.map((u) => ({
      id: u.id,
      label: u.label,
      url: mode.kind === 'shop' ? u.url || storeUrl || null : null,
    })),
    defaultUpgrades: mode.defaultUpgrades,
  }));
}

// Builds the full edit prompt for the image model. Only items that belong to the
// chosen plan are accepted, so a Glow Up can't quietly become a deck build.
export function buildPrompt({ mode, upgradeIds, style }) {
  // Own keys only, so a name like 'toString' is an unknown plan rather than a crash.
  const catalog = Object.hasOwn(MODES, mode) ? MODES[mode] : null;
  if (!catalog) throw new Error(`Unknown plan: ${mode}`);

  if (upgradeIds.some((id) => !catalog.upgrades.some((u) => u.id === id))) {
    throw new Error(`That item isn't part of ${catalog.label}`);
  }
  const chosen = catalog.upgrades.filter((u) => upgradeIds.includes(u.id));
  if (chosen.length === 0) throw new Error(catalog.kind === 'shop' ? 'Pick at least one item' : 'Pick at least one upgrade');

  const list = chosen.map((u) => u.prompt).join('; ');
  const styleText = STYLES[style]?.prompt;
  const parts = [
    catalog.kind === 'shop'
      ? `Add these outdoor products to this backyard photo, placed where they would naturally go and at realistic sizes: ${list}.`
      : `Edit this backyard photo to show a finished professional renovation with: ${list}.`,
  ];
  if (styleText) parts.push(`Style: ${styleText}.`);
  parts.push(KEEP_RULES);
  return parts.join(' ');
}
