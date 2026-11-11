/**
 * The 20 objects (CLAUDE.md §6). Each entry is data; the shape module is loaded lazily.
 * Descriptions are first drafts written for the owner to edit (see §15.1).
 */
import type { Group, ObjectDef, ToolId } from './types';

const BASE: ToolId[] = ['hand', 'poke', 'press', 'knife'];

/** Tool availability per §10. */
function tools(group: Group, extra: ToolId[] = []): ToolId[] {
  const byGroup: Record<Group, ToolId[]> = {
    jelly: [...BASE, 'wavy', 'cutter'],
    fruit: [...BASE, 'wavy', 'fork'],
    soft: [...BASE, 'wavy', 'fork'],
    firm: [...BASE],
  };
  return [...new Set([...byGroup[group], ...extra])];
}

export const OBJECTS: ObjectDef[] = [
  // ------------------------------------------------------------------ Jelly (1–9)
  {
    id: 'dolphin',
    no: 1,
    group: 'jelly',
    title: ['Dolphin', 'Jelly.'],
    description: 'A clear jelly dolphin that wobbles from beak to flukes.',
    material: 'jelly',
    variants: [
      { id: 'atlantic', label: 'Atlantic', color: '#4A93CC', darkest: '#2C5F8A' },
      { id: 'lagoon', label: 'Lagoon', color: '#2FB5A3', darkest: '#1E7D70' },
      { id: 'rose', label: 'Rose', color: '#E886A6', darkest: '#B5506F' },
    ],
    tools: tools('jelly'),
    actions: [
      { id: 'kick', label: 'Kick flukes' },
      { id: 'blow', label: 'Blow' },
    ],
    load: () => import('./shapes/dolphin').then((m) => m.dolphin),
  },
  {
    id: 'gummy-bear',
    firmness: 0.92,
    no: 2,
    group: 'jelly',
    title: ['Gummy', 'Bear.'],
    description: 'Chewy, bouncy and far too big to eat in one go.',
    material: 'jelly',
    variants: [
      { id: 'red', label: 'Red', color: '#D63A3A' },
      { id: 'green', label: 'Green', color: '#4CB050' },
      { id: 'orange', label: 'Orange', color: '#F28A1E' },
      { id: 'yellow', label: 'Yellow', color: '#F2CB2E' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'bounce', label: 'Bounce' }],
    load: () => import('./shapes/gummyBear').then((m) => m.gummyBear),
  },
  {
    id: 'octopus',
    no: 3,
    group: 'jelly',
    title: ['Octopus', 'Jelly.'],
    description: 'Eight soft arms, each with a wobble of its own.',
    material: 'jelly',
    variants: [
      { id: 'plum', label: 'Plum', color: '#8E4C94' },
      { id: 'coral', label: 'Coral', color: '#F07A62' },
      { id: 'mint', label: 'Mint', color: '#5FCFAE' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'wiggle', label: 'Wiggle arms' }],
    load: () => import('./shapes/octopus').then((m) => m.octopus),
  },
  {
    id: 'duck',
    firmness: 0.74,
    no: 4,
    group: 'jelly',
    title: ['Jelly', 'Duck.'],
    description: 'A bath-time duck set in jelly. Squeeze it gently.',
    material: 'jelly',
    variants: [
      { id: 'lemon', label: 'Lemon', color: '#F2D24B' },
      { id: 'peach', label: 'Peach', color: '#F5A97A' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'squeak', label: 'Squeak' }],
    load: () => import('./shapes/duck').then((m) => m.duck),
  },
  {
    id: 'star',
    firmness: 0.86,
    no: 5,
    group: 'jelly',
    title: ['Star', 'Jelly.'],
    description: 'A thick five-point star, glossy on every edge.',
    material: 'jelly',
    variants: [
      { id: 'gold', label: 'Gold', color: '#F2B33A' },
      { id: 'sky', label: 'Sky', color: '#6BB6EA' },
      { id: 'berry', label: 'Berry', color: '#C2457A' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'spin', label: 'Spin' }],
    load: () => import('./shapes/starHeart').then((m) => m.star),
  },
  {
    id: 'heart',
    firmness: 0.86,
    no: 6,
    group: 'jelly',
    title: ['Heart', 'Jelly.'],
    description: 'A jelly heart that keeps a slow, soft beat.',
    material: 'jelly',
    variants: [
      { id: 'rose', label: 'Rose', color: '#E85C78' },
      { id: 'ruby', label: 'Ruby', color: '#C2203E' },
      { id: 'blush', label: 'Blush', color: '#F4A7B9' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'beat', label: 'Heartbeat' }],
    load: () => import('./shapes/starHeart').then((m) => m.heart),
  },
  {
    id: 'axolotl',
    no: 7,
    group: 'jelly',
    title: ['Axolotl', 'Jelly.'],
    description: 'A smiling axolotl with six feathery gills.',
    material: 'jelly',
    variants: [
      { id: 'pink', label: 'Pink', color: '#F2A1BC' },
      { id: 'mint', label: 'Mint', color: '#8FD8C0' },
      { id: 'gold', label: 'Gold', color: '#F2C14E' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'gills', label: 'Wiggle gills' }],
    load: () => import('./shapes/axolotl').then((m) => m.axolotl),
  },
  {
    id: 'penguin',
    firmness: 0.86,
    no: 8,
    group: 'jelly',
    title: ['Penguin', 'Jelly.'],
    description: 'A round little penguin that waddles when nudged.',
    material: 'jelly',
    variants: [
      { id: 'classic', label: 'Classic', color: '#2B3A67', lightest: '#F4F1EA' },
      { id: 'ice', label: 'Ice', color: '#9CC9E8' },
      { id: 'sunset', label: 'Sunset', color: '#F08A5D' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'waddle', label: 'Waddle' }],
    load: () => import('./shapes/penguin').then((m) => m.penguin),
  },
  {
    id: 'puffy',
    firmness: 0.68,
    no: 9,
    group: 'jelly',
    title: ['Puffy.', ''],
    description: 'A marshmallow puffball. Poke it and it says puu.',
    material: 'jelly',
    variants: [
      { id: 'cotton', label: 'Cotton pink', color: '#F6B3CE' },
      { id: 'lavender', label: 'Lavender', color: '#C3AEEB' },
      { id: 'peach', label: 'Peach', color: '#F8C29C' },
    ],
    tools: tools('jelly'),
    actions: [{ id: 'puff', label: 'Puff up' }],
    load: () => import('./shapes/puffy').then((m) => m.puffy),
  },

  // ------------------------------------------------------------------ Fruit (10–13)
  {
    id: 'orange-slice',
    no: 10,
    group: 'fruit',
    title: ['Citrus', 'Slice.'],
    description: 'A thick citrus wheel, juicy segment by segment.',
    material: 'fruit-juicy',
    variants: [
      { id: 'orange', label: 'Orange', color: '#F28A1E' },
      { id: 'blood', label: 'Blood orange', color: '#C8312E', lightest: '#FBE9C8' },
      { id: 'lemon', label: 'Lemon', color: '#F2D84A' },
    ],
    tools: tools('fruit', ['cutter']),
    actions: [],
    load: () => import('./shapes/orangeSlice').then((m) => m.orangeSlice),
  },
  {
    id: 'apple',
    no: 11,
    group: 'fruit',
    title: ['Crisp', 'Apple.'],
    description: 'Firm and snappy, with a crunch under the skin.',
    material: 'fruit-crisp',
    variants: [
      { id: 'red', label: 'Red', color: '#C62E2E' },
      { id: 'green', label: 'Green', color: '#8CC63F' },
      { id: 'gold', label: 'Gold', color: '#E8C547' },
    ],
    tools: tools('fruit', ['hammer']),
    actions: [{ id: 'bite', label: 'Take a bite' }],
    load: () => import('./shapes/apple').then((m) => m.apple),
  },
  {
    id: 'watermelon',
    no: 12,
    group: 'fruit',
    title: ['Water', 'melon.'],
    description: 'A summer wedge: crunchy rind, sweet flesh, black seeds.',
    material: 'fruit-juicy',
    variants: [
      { id: 'classic', label: 'Classic', color: '#E94E5E' },
      { id: 'yellow', label: 'Yellow', color: '#F5D35B' },
    ],
    tools: tools('fruit', ['cutter', 'spoon', 'hammer']),
    actions: [{ id: 'seeds', label: 'Pop the seeds' }],
    load: () => import('./shapes/watermelon').then((m) => m.watermelon),
  },
  {
    id: 'tomato',
    // Ripe: gives under a press and bursts, but never bounces like rubber.
    physics: { rigidity: 0.85, plastic: { yield: 0.06, rate: 2, recover: 0.5 }, restitution: 0.02 },
    no: 13,
    group: 'fruit',
    title: ['Ripe', 'Tomato.'],
    description: 'Plump and taut. Press too hard and it bursts.',
    material: 'fruit-juicy',
    variants: [
      { id: 'red', label: 'Red', color: '#DD3B2A' },
      { id: 'yellow', label: 'Yellow', color: '#F2C230' },
    ],
    tools: tools('fruit', ['hammer']),
    actions: [],
    load: () => import('./shapes/tomato').then((m) => m.tomato),
  },

  // ------------------------------------------------------------------ Soft (14–18)
  {
    id: 'cake',
    no: 14,
    group: 'soft',
    title: ['Layer', 'Cake.'],
    description: 'Sponge and cream in layers, crumbling at the edges.',
    material: 'sponge',
    variants: [
      { id: 'vanilla', label: 'Vanilla', color: '#F3DFB5', lightest: '#FFF8EC' },
      { id: 'chocolate', label: 'Chocolate', color: '#6B3E26', lightest: '#F1E4D3' },
      { id: 'strawberry', label: 'Strawberry', color: '#F2A6B5', lightest: '#FFF4E0' },
    ],
    tools: tools('soft', ['cutter', 'spoon']),
    actions: [{ id: 'crumble', label: 'Crumble' }],
    load: () => import('./shapes/cake').then((m) => m.cake),
  },
  {
    id: 'bread',
    // Springs back.
    physics: { rigidity: 0.6, plastic: { yield: 0.03, rate: 5, recover: 0.7 }, tear: 0.16 },
    no: 15,
    group: 'soft',
    title: ['Soft', 'Loaf.'],
    description: 'Squish it flat and watch it slowly spring back.',
    material: 'sponge',
    variants: [
      { id: 'white', label: 'White', color: '#D79A55', lightest: '#F6EAD2' },
      { id: 'wheat', label: 'Wheat', color: '#A86E3C', lightest: '#E8D2B0' },
    ],
    tools: tools('soft', ['cutter']),
    actions: [{ id: 'squish', label: 'Squish' }],
    load: () => import('./shapes/bread').then((m) => m.bread),
  },
  {
    id: 'donut',
    physics: { rigidity: 0.75, plastic: { yield: 0.03, rate: 5, recover: 0.3 }, tear: 0.14 },
    no: 16,
    group: 'soft',
    title: ['Glazed', 'Donut.'],
    description: 'A glazed ring with sprinkles that scatter when it lands.',
    material: 'sponge',
    variants: [
      { id: 'pink', label: 'Pink', color: '#F0A6C2' },
      { id: 'chocolate', label: 'Chocolate', color: '#5E3523' },
      { id: 'vanilla', label: 'Vanilla', color: '#F6E9CF' },
    ],
    tools: tools('soft'),
    actions: [{ id: 'sprinkles', label: 'Sprinkle burst' }],
    load: () => import('./shapes/donut').then((m) => m.donut),
  },
  {
    id: 'pudding',
    no: 17,
    group: 'soft',
    title: ['Custard', 'Pudding.'],
    description: 'Silky custard under a caramel top. It jiggles.',
    material: 'cream',
    variants: [
      { id: 'caramel', label: 'Caramel', color: '#F0C25E', darkest: '#7A3E12' },
      { id: 'chocolate', label: 'Chocolate', color: '#7A4A2E', darkest: '#3E2213' },
      { id: 'matcha', label: 'Matcha', color: '#A9C46C', darkest: '#4F6A2A' },
    ],
    tools: tools('soft', ['spoon']),
    actions: [{ id: 'jiggle', label: 'Jiggle' }],
    load: () => import('./shapes/pudding').then((m) => m.pudding),
  },
  {
    id: 'mochi',
    no: 18,
    group: 'soft',
    title: ['Mochi.', ''],
    description: 'A soft, stretchy rice cake with a sleepy little face.',
    material: 'mochi',
    neutralHue: 165,
    variants: [
      { id: 'white', label: 'White', color: '#F7F3EC' },
      { id: 'pink', label: 'Pink', color: '#F6C9D3' },
      { id: 'green', label: 'Green', color: '#BFD99B' },
    ],
    tools: tools('soft', ['spoon']),
    actions: [{ id: 'stretch', label: 'Stretch' }],
    load: () => import('./shapes/mochi').then((m) => m.mochi),
  },

  // ------------------------------------------------------------------ Firm (19–20)
  {
    id: 'cheese',
    no: 19,
    group: 'firm',
    title: ['Cheese', 'Wedge.'],
    description: 'A firm wedge that slices clean and smooth.',
    material: 'firm-dairy',
    variants: [
      { id: 'swiss', label: 'Swiss', color: '#F2D98A' },
      { id: 'cheddar', label: 'Cheddar', color: '#F2A33A' },
    ],
    tools: tools('firm', ['fork']),
    actions: [{ id: 'slice', label: 'Slice' }],
    rebuildOnVariant: true,
    load: () => import('./shapes/cheeseChocolate').then((m) => m.cheese),
  },
  {
    id: 'chocolate',
    no: 20,
    group: 'firm',
    title: ['Chocolate', 'Bar.'],
    description: 'A segmented bar that snaps cleanly along its lines.',
    material: 'brittle',
    variants: [
      { id: 'milk', label: 'Milk', color: '#7B4A2E' },
      { id: 'dark', label: 'Dark', color: '#4A2A1C' },
      { id: 'ruby', label: 'Ruby', color: '#D8778A' },
    ],
    tools: tools('firm', ['hammer']),
    actions: [{ id: 'snap', label: 'Snap' }],
    load: () => import('./shapes/cheeseChocolate').then((m) => m.chocolate),
  },
];

/** Hidden physics-spike object, reachable only at ?dev=blob (§4 Phase 1). */
export const DEV_BLOB: ObjectDef = {
  id: 'dev-blob',
  no: 0,
  group: 'jelly',
  title: ['Dev', 'Blob.'],
  description: 'A plain jelly drop for tuning the soft-body solver. Not in the selector.',
  material: 'jelly',
  variants: [
    { id: 'mint', label: 'Mint', color: '#3FB8A2' },
    { id: 'rose', label: 'Rose', color: '#E8708F' },
    { id: 'amber', label: 'Amber', color: '#F0A93B' },
  ],
  tools: ['hand', 'poke', 'press'],
  actions: [{ id: 'bounce', label: 'Bounce' }],
  load: () => import('./shapes/blob').then((m) => m.blob),
};

export const GROUP_LABELS: Record<Group, string> = {
  jelly: 'Jelly',
  fruit: 'Fruit',
  soft: 'Soft',
  firm: 'Firm',
};

export function findObject(id: string | null | undefined): ObjectDef | undefined {
  return OBJECTS.find((o) => o.id === id);
}
