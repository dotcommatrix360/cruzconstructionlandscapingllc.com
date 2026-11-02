// Project photos by category. STOCK for now (owner's instruction) and always labelled as example photos.
// Replace each entry with real Cruz Construction project photos as they arrive (keep the categories).
import type { ImageMetadata } from 'astro';
import kitchenImg from '../assets/images/kitchen-remodel-island.jpg';
import kitchen2Img from '../assets/images/kitchen-white-cabinets.jpg';
import tileImg from '../assets/images/tile-subway-backsplash.jpg';
import bathImg from '../assets/images/bathroom-tile-shower.jpg';
import tubImg from '../assets/images/bathroom-freestanding-tub.jpg';
import greyBathImg from '../assets/images/bathroom-grey-tile-vanity.jpg';
import basementImg from '../assets/images/finished-living-space.jpg';
import lvpImg from '../assets/images/lvp-flooring-room.jpg';
import roomImg from '../assets/images/finished-room-trim-windows.jpg';
import paintImg from '../assets/images/interior-paint-roller.jpg';
import measureImg from '../assets/images/carpentry-measuring-board.jpg';
import sawImg from '../assets/images/carpenter-circular-saw.jpg';

export type Category = 'kitchen' | 'bathroom' | 'basement' | 'finish';
export interface Project { cat: Category; img: ImageMetadata; alt: string; title: string }

export const categories: { id: Category; label: string }[] = [
  { id: 'kitchen', label: 'Kitchen remodeling' },
  { id: 'bathroom', label: 'Bathroom remodeling' },
  { id: 'basement', label: 'Basement finishing' },
  { id: 'finish', label: 'Drywall, paint & trim' },
];

export const projects: Project[] = [
  { cat: 'kitchen', img: kitchenImg, alt: 'Remodeled kitchen with an island, pendant lights and tile backsplash', title: 'Kitchen with island' },
  { cat: 'kitchen', img: kitchen2Img, alt: 'Bright kitchen with white cabinets and a stone counter', title: 'White cabinet kitchen' },
  { cat: 'kitchen', img: tileImg, alt: 'White subway tile backsplash behind a kitchen faucet', title: 'Subway tile backsplash' },
  { cat: 'bathroom', img: bathImg, alt: 'Bathroom with a glass tile shower and double vanity', title: 'Glass tile shower' },
  { cat: 'bathroom', img: tubImg, alt: 'Bathroom with a freestanding tub and vessel sink', title: 'Freestanding tub bathroom' },
  { cat: 'bathroom', img: greyBathImg, alt: 'Bathroom with large grey tile walls and floor', title: 'Grey tile bathroom' },
  { cat: 'basement', img: basementImg, alt: 'Finished lower-level living space with wood-look flooring', title: 'Finished living space' },
  { cat: 'basement', img: lvpImg, alt: 'Bright finished room with wood-look plank flooring', title: 'LVP flooring' },
  { cat: 'basement', img: roomImg, alt: 'Finished room with white trim around the windows', title: 'Finished room with trim' },
  { cat: 'finish', img: paintImg, alt: 'Paint roller applying fresh color to a smooth wall', title: 'Interior painting' },
  { cat: 'finish', img: measureImg, alt: 'Carpenter measuring a board before cutting', title: 'Trim carpentry' },
  { cat: 'finish', img: sawImg, alt: 'Carpenter cutting a board with a circular saw', title: 'Framing and carpentry' },
];

/** Which photo category each service page shows. */
export const serviceCategory: Record<string, Category> = {
  'kitchen-remodeling': 'kitchen', 'kitchen-backsplash': 'kitchen', 'cabinet-installation': 'kitchen',
  'bathroom-remodeling': 'bathroom', 'custom-tile-showers': 'bathroom',
  'basement-finishing': 'basement', 'drop-ceilings': 'basement', 'insulation': 'basement', 'tile-lvp-flooring': 'basement',
  'drywall': 'finish', 'painting': 'finish', 'carpentry-trim': 'finish', 'door-replacement': 'finish',
};

/**
 * Before & after pairs. Leave EMPTY until the client sends real before/after photos of the SAME project —
 * stock photos of two different rooms would be a fake transformation. The home page section renders only
 * when this has entries.
 */
export const beforeAfter: { before: ImageMetadata; after: ImageMetadata; title: string; beforeAlt: string; afterAlt: string }[] = [];
