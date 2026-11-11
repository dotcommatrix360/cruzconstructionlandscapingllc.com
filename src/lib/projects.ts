// Project photos by category. Real Cruz Construction jobs: frames taken from the client's own walkthrough videos
// (Google Drive "Cruz Construction", 2026-11-11; the videos themselves are in public/videos/, see src/lib/videos.ts).
// The kitchen category is still STOCK (owner's instruction, shown without a label): no kitchen remodel footage yet.
// Replace those three as soon as the client sends kitchen, backsplash or cabinet photos.
import type { ImageMetadata } from 'astro';
// Stock (kitchen only)
import kitchenImg from '../assets/images/kitchen-remodel-island.jpg';
import kitchen2Img from '../assets/images/kitchen-white-cabinets.jpg';
import tileImg from '../assets/images/tile-subway-backsplash.jpg';
// Real project frames
import showerImg from '../assets/images/tile-shower-dark-subway-pony-wall.jpg';
import showerFloorImg from '../assets/images/tile-shower-basketweave-floor-niche.jpg';
import tubImg from '../assets/images/bathroom-tub-surround-subway-tile.jpg';
import vanityImg from '../assets/images/bathroom-vanity-slate-tile-floor.jpg';
import basementImg from '../assets/images/finished-basement-lvp-drop-ceiling.jpg';
import dropCeilingImg from '../assets/images/basement-drop-ceiling-green-walls.jpg';
import bedroomImg from '../assets/images/bedroom-finished-lvp.jpg';
import crewImg from '../assets/images/crew-replacing-kitchen-ceiling-drywall.jpg';
import stairsImg from '../assets/images/staircase-white-railing-carpet.jpg';
import columnsImg from '../assets/images/dining-room-columns-lvp-flooring.jpg';
import frenchDoorsImg from '../assets/images/french-doors-and-entry-door.jpg';
import livingImg from '../assets/images/living-room-lvp-staircase.jpg';
// Before & after (same room, same project)
import bathBefore from '../assets/images/bathroom-tub-framing-before.jpg';
import basementBefore from '../assets/images/basement-unfinished-before.jpg';
import bedroomBefore from '../assets/images/bedroom-framing-insulation-before.jpg';
import ceilingBefore from '../assets/images/kitchen-ceiling-opened-before.jpg';
import ceilingAfter from '../assets/images/kitchen-after-ceiling-drywall.jpg';

export type Category = 'kitchen' | 'bathroom' | 'basement' | 'finish';
export interface Project { cat: Category; img: ImageMetadata; alt: string; title: string }

export const categories: { id: Category; label: string }[] = [
  { id: 'kitchen', label: 'Kitchen remodeling' },
  { id: 'bathroom', label: 'Bathroom remodeling' },
  { id: 'basement', label: 'Basement finishing' },
  { id: 'finish', label: 'Drywall, paint & trim' },
];

export const projects: Project[] = [
  { cat: 'bathroom', img: showerImg, alt: 'Walk-in tile shower with dark glazed subway tile, a pony wall and a checkered floor', title: 'Custom tile shower' },
  { cat: 'bathroom', img: showerFloorImg, alt: 'Marble basketweave shower floor with a recessed niche in dark subway tile walls', title: 'Shower floor and niche' },
  { cat: 'bathroom', img: tubImg, alt: 'New tub surround framed with grey subway tile and a recessed light', title: 'Tub surround with tile' },
  { cat: 'bathroom', img: vanityImg, alt: 'Remodeled bathroom with a granite vanity, slate-look tile floor and a new door', title: 'Bathroom remodel' },
  { cat: 'basement', img: basementImg, alt: 'Finished basement with wood-look LVP flooring, a drop ceiling and a wrapped support post', title: 'Finished basement' },
  { cat: 'basement', img: dropCeilingImg, alt: 'Basement drop ceiling with a light panel over green walls and LVP flooring', title: 'Drop ceiling' },
  { cat: 'finish', img: bedroomImg, alt: 'Finished bedroom with grey walls, a ceiling light and LVP flooring', title: 'Bedroom, framing to finish' },
  { cat: 'finish', img: crewImg, alt: 'Cruz Construction crew on ladders replacing a kitchen ceiling', title: 'Ceiling drywall replacement' },
  { cat: 'finish', img: stairsImg, alt: 'Staircase with white railings, new stair carpet and a wrought-iron chandelier', title: 'Stairs, railings and paint' },
  { cat: 'finish', img: columnsImg, alt: 'Dining room with white columns, fresh paint and wood-look LVP flooring', title: 'Columns and trim' },
  { cat: 'finish', img: frenchDoorsImg, alt: 'Glass-panel French doors and a front entry door with sidelights over new LVP flooring', title: 'Doors and flooring' },
  { cat: 'finish', img: livingImg, alt: 'Open living area with wood-look LVP flooring and a white-railed staircase', title: 'Whole-floor LVP and paint' },
  // Stock, see the note at the top
  { cat: 'kitchen', img: kitchenImg, alt: 'Remodeled kitchen with an island, pendant lights and tile backsplash', title: 'Kitchen with island' },
  { cat: 'kitchen', img: kitchen2Img, alt: 'Bright kitchen with white cabinets and a stone counter', title: 'White cabinet kitchen' },
  { cat: 'kitchen', img: tileImg, alt: 'White subway tile backsplash behind a kitchen faucet', title: 'Subway tile backsplash' },
];

/** Which photo category each service page shows. */
export const serviceCategory: Record<string, Category> = {
  'kitchen-remodeling': 'kitchen', 'kitchen-backsplash': 'kitchen', 'cabinet-installation': 'kitchen',
  'bathroom-remodeling': 'bathroom', 'custom-tile-showers': 'bathroom',
  'basement-finishing': 'basement', 'drop-ceilings': 'basement', 'insulation': 'basement', 'tile-lvp-flooring': 'finish',
  'drywall': 'finish', 'painting': 'finish', 'carpentry-trim': 'finish', 'door-replacement': 'finish',
};

/**
 * Before & after pairs: real frames of the SAME room on the SAME job, taken from the client's walkthrough videos.
 * Never pair two different rooms or stock photos (that would be a fake transformation).
 */
export const beforeAfter: { before: ImageMetadata; after: ImageMetadata; title: string; beforeAlt: string; afterAlt: string }[] = [
  { before: bathBefore, after: tubImg, title: 'Bathroom tub surround', beforeAlt: 'Bathroom opened to the studs with insulation and a new tub unit going in', afterAlt: 'Finished tub surround with grey subway tile trim and a recessed light' },
  { before: basementBefore, after: basementImg, title: 'Basement finishing', beforeAlt: 'Unfinished basement with exposed joists, a bare concrete floor and work lights', afterAlt: 'Finished basement with green walls, a drop ceiling and wood-look LVP flooring' },
  { before: bedroomBefore, after: bedroomImg, title: 'Bedroom remodel', beforeAlt: 'Bedroom framed out with insulation, a ladder and an open ceiling', afterAlt: 'The same bedroom finished, with grey walls, a ceiling light and LVP flooring' },
  { before: ceilingBefore, after: ceilingAfter, title: 'Kitchen ceiling replacement', beforeAlt: 'Kitchen ceiling removed down to the joists with the room covered in plastic', afterAlt: 'The same kitchen with the new ceiling finished and recessed lights on' },
];
