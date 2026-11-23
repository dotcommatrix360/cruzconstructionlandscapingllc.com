// Project photos by category. All real Cruz Construction jobs:
// - phone photos the client sent on 2026-11-23 (Google Photos export, 2048 px originals, resized to ≤1600 px), and
// - frames from the client's walkthrough videos (Google Drive "Cruz Construction", 2026-11-11; videos in public/videos/).
// No stock photos are used anymore (the temporary kitchen stock was replaced on 2026-11-23).
import type { ImageMetadata } from 'astro';
// Kitchen (photos, 2026-11-23)
import kitchenLImg from '../assets/images/kitchen-white-shaker-quartz-l-shape.jpg';
import kitchenLightsImg from '../assets/images/kitchen-under-cabinet-lights-quartz.jpg';
import kitchenRangeImg from '../assets/images/kitchen-stainless-range-fridge.jpg';
import pantryImg from '../assets/images/kitchen-tall-pantry-cabinets.jpg';
import backsplashImg from '../assets/images/kitchen-subway-backsplash-range.jpg';
import islandImg from '../assets/images/kitchen-island-white-dark-top.jpg';
// Bathroom (photos, 2026-11-23)
import glassShowerImg from '../assets/images/glass-shower-white-tile.jpg';
import bigTileShowerImg from '../assets/images/tile-shower-large-format-after.jpg';
import nicheImg from '../assets/images/shower-niche-mosaic-grab-bar.jpg';
import halfBathImg from '../assets/images/half-bath-pedestal-sink.jpg';
import cornerShowerImg from '../assets/images/corner-glass-shower-after.jpg';
import hexBathImg from '../assets/images/bathroom-hex-tile-floor-vanity.jpg';
// Bathroom (video frames)
import showerImg from '../assets/images/tile-shower-dark-subway-pony-wall.jpg';
import showerFloorImg from '../assets/images/tile-shower-basketweave-floor-niche.jpg';
import tubImg from '../assets/images/bathroom-tub-surround-subway-tile.jpg';
// Basement (video frames)
import basementImg from '../assets/images/finished-basement-lvp-drop-ceiling.jpg';
import dropCeilingImg from '../assets/images/basement-drop-ceiling-green-walls.jpg';
// Flooring, drywall, paint, trim and carpentry
import familyRoomImg from '../assets/images/family-room-lvp-after.jpg';
import livingRoomImg from '../assets/images/living-room-lvp-after.jpg';
import openPlanImg from '../assets/images/open-kitchen-living-lvp.jpg';
import hallwayImg from '../assets/images/hallway-lvp-flooring.jpg';
import shedImg from '../assets/images/shed-vinyl-siding-after.jpg';
import bedroomImg from '../assets/images/bedroom-finished-lvp.jpg';
import crewImg from '../assets/images/crew-replacing-kitchen-ceiling-drywall.jpg';
import stairsImg from '../assets/images/staircase-white-railing-carpet.jpg';
import columnsImg from '../assets/images/dining-room-columns-lvp-flooring.jpg';
// Before & after (same room, same project)
import kitchenBefore from '../assets/images/kitchen-cabinets-install-before.jpg';
import familyRoomBefore from '../assets/images/family-room-floor-before.jpg';
import livingRoomBefore from '../assets/images/living-room-floor-before.jpg';
import cornerShowerBefore from '../assets/images/corner-shower-pan-before.jpg';
import showerBefore from '../assets/images/shower-demo-to-studs-before.jpg';
import shedBefore from '../assets/images/shed-framing-before.jpg';
import bathBefore from '../assets/images/bathroom-tub-framing-before.jpg';
import basementBefore from '../assets/images/basement-unfinished-before.jpg';

export type Category = 'kitchen' | 'bathroom' | 'basement' | 'finish';
export interface Project { cat: Category; img: ImageMetadata; alt: string; title: string }

export const categories: { id: Category; label: string }[] = [
  { id: 'kitchen', label: 'Kitchen remodeling' },
  { id: 'bathroom', label: 'Bathroom remodeling' },
  { id: 'basement', label: 'Basement finishing' },
  { id: 'finish', label: 'Flooring, drywall & trim' },
];

export const projects: Project[] = [
  { cat: 'kitchen', img: kitchenLImg, alt: 'Finished L-shaped kitchen with white shaker cabinets, quartz counters, a stainless dishwasher and pendant lights', title: 'White shaker kitchen' },
  { cat: 'kitchen', img: kitchenLightsImg, alt: 'White kitchen cabinets with under-cabinet lighting, quartz counters and a window over the sink', title: 'Cabinets and lighting' },
  { cat: 'kitchen', img: kitchenRangeImg, alt: 'Kitchen wall with white cabinets, a stainless gas range, microwave and refrigerator', title: 'Kitchen remodel' },
  { cat: 'kitchen', img: pantryImg, alt: 'Floor-to-ceiling white pantry cabinets installed in a kitchen', title: 'Pantry cabinets' },
  { cat: 'kitchen', img: backsplashImg, alt: 'Grey subway tile backsplash behind a stainless gas range during a kitchen remodel', title: 'Subway tile backsplash' },
  { cat: 'kitchen', img: islandImg, alt: 'White kitchen island with a dark wood-look top on new LVP flooring', title: 'Kitchen island' },
  { cat: 'bathroom', img: glassShowerImg, alt: 'Walk-in shower with white tile, a glass door, grab bar and built-in bench', title: 'Glass walk-in shower' },
  { cat: 'bathroom', img: bigTileShowerImg, alt: 'Large-format stone-look tile shower with a white mosaic floor and grab bars', title: 'Large-format tile shower' },
  { cat: 'bathroom', img: cornerShowerImg, alt: 'Corner shower with a framed glass enclosure and grey tile floor', title: 'Corner glass shower' },
  { cat: 'bathroom', img: nicheImg, alt: 'Shower niche with a glass mosaic accent next to a stainless grab bar', title: 'Shower niche' },
  { cat: 'bathroom', img: hexBathImg, alt: 'Bathroom with a grey hexagon tile floor, dark vanity and white walls', title: 'Hex tile bathroom' },
  { cat: 'bathroom', img: halfBathImg, alt: 'Half bath with a pedestal sink, grey walls and LVP flooring', title: 'Half bath remodel' },
  { cat: 'bathroom', img: showerImg, alt: 'Walk-in tile shower with dark glazed subway tile, a pony wall and a checkered floor', title: 'Custom tile shower' },
  { cat: 'bathroom', img: showerFloorImg, alt: 'Marble basketweave shower floor with a recessed niche in dark subway tile walls', title: 'Shower floor and niche' },
  { cat: 'bathroom', img: tubImg, alt: 'New tub surround framed with grey subway tile and a recessed light', title: 'Tub surround with tile' },
  { cat: 'basement', img: basementImg, alt: 'Finished basement with wood-look LVP flooring, a drop ceiling and a wrapped support post', title: 'Finished basement' },
  { cat: 'basement', img: dropCeilingImg, alt: 'Basement drop ceiling with a light panel over green walls and LVP flooring', title: 'Drop ceiling' },
  { cat: 'finish', img: familyRoomImg, alt: 'Large family room with new wood-look LVP flooring and white baseboards', title: 'Family room flooring' },
  { cat: 'finish', img: livingRoomImg, alt: 'Living room with new light wood-look LVP flooring', title: 'Living room LVP' },
  { cat: 'finish', img: openPlanImg, alt: 'Open kitchen and living area with LVP flooring throughout', title: 'Open floor plan LVP' },
  { cat: 'finish', img: hallwayImg, alt: 'Hallway with new LVP flooring and white baseboards leading to the stairs', title: 'Hallway flooring' },
  { cat: 'finish', img: shedImg, alt: 'New backyard shed with white vinyl siding, a window and an entry door', title: 'Shed build' },
  { cat: 'finish', img: bedroomImg, alt: 'Finished bedroom with grey walls, a ceiling light and LVP flooring', title: 'Bedroom, framing to finish' },
  { cat: 'finish', img: crewImg, alt: 'Cruz Construction crew on ladders replacing a kitchen ceiling', title: 'Ceiling drywall replacement' },
  { cat: 'finish', img: stairsImg, alt: 'Staircase with white railings, new stair carpet and a wrought-iron chandelier', title: 'Stairs, railings and paint' },
  { cat: 'finish', img: columnsImg, alt: 'Dining room with white columns, fresh paint and wood-look LVP flooring', title: 'Columns and trim' },
];

/** Which photo category each service page shows. */
export const serviceCategory: Record<string, Category> = {
  'kitchen-remodeling': 'kitchen', 'kitchen-backsplash': 'kitchen', 'cabinet-installation': 'kitchen',
  'bathroom-remodeling': 'bathroom', 'custom-tile-showers': 'bathroom',
  'basement-finishing': 'basement', 'drop-ceilings': 'basement', 'insulation': 'basement', 'tile-lvp-flooring': 'finish',
  'drywall': 'finish', 'painting': 'finish', 'carpentry-trim': 'finish', 'door-replacement': 'finish',
};

/**
 * Before & after pairs: real photos of the SAME room on the SAME job, from the same angle.
 * Never pair two different rooms or stock photos (that would be a fake transformation).
 */
export const beforeAfter: { before: ImageMetadata; after: ImageMetadata; title: string; beforeAlt: string; afterAlt: string }[] = [
  { before: kitchenBefore, after: kitchenLightsImg, title: 'Kitchen remodel', beforeAlt: 'Kitchen mid-remodel with open cabinet boxes, no doors and a covered counter', afterAlt: 'The same kitchen finished with white shaker doors, quartz counters and under-cabinet lights' },
  { before: familyRoomBefore, after: familyRoomImg, title: 'Family room flooring', beforeAlt: 'Family room with the old flooring removed down to the subfloor', afterAlt: 'The same family room with new wood-look LVP flooring and white baseboards' },
  { before: livingRoomBefore, after: livingRoomImg, title: 'Living room LVP', beforeAlt: 'Living room with old flooring torn up and new planks going in', afterAlt: 'The same living room finished with light wood-look LVP flooring' },
  { before: showerBefore, after: bigTileShowerImg, title: 'Shower rebuild', beforeAlt: 'Old shower torn out to the studs with the subfloor exposed', afterAlt: 'The same shower rebuilt with large-format tile, a mosaic floor and grab bars' },
  { before: cornerShowerBefore, after: cornerShowerImg, title: 'Corner shower', beforeAlt: 'Corner shower with a waterproofing membrane on the walls and a new shower pan', afterAlt: 'The same corner shower finished with a framed glass enclosure' },
  { before: shedBefore, after: shedImg, title: 'Shed build', beforeAlt: 'Shed walls framed on a new concrete pad', afterAlt: 'The same shed finished with white vinyl siding, a window and a door' },
  { before: basementBefore, after: basementImg, title: 'Basement finishing', beforeAlt: 'Unfinished basement with exposed joists, a bare concrete floor and work lights', afterAlt: 'Finished basement with green walls, a drop ceiling and wood-look LVP flooring' },
  { before: bathBefore, after: tubImg, title: 'Bathroom tub surround', beforeAlt: 'Bathroom opened to the studs with insulation and a new tub unit going in', afterAlt: 'Finished tub surround with grey subway tile trim and a recessed light' },
];
