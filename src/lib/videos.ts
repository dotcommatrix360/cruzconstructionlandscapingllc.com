// Real Cruz Construction project walkthrough videos (client's Google Drive folder "Cruz Construction", 2026-11-11).
// Files live in public/videos/ (re-encoded for the web: H.264, faststart, ~1 Mbps, vertical 720×1280).
// Two clips carried xHE-AAC audio that Firefox/Chrome cannot play, so they are published without sound.
// Posters are frames from the same video (src/assets/images/). `services` = service page ids that show the video.
import type { ImageMetadata } from 'astro';
import wholeHome from '../assets/images/hallway-white-panel-doors.jpg';
import twoStory from '../assets/images/staircase-white-railing-carpet.jpg';
import ceiling from '../assets/images/crew-replacing-kitchen-ceiling-drywall.jpg';
import basement from '../assets/images/finished-basement-lvp-drop-ceiling.jpg';
import shower from '../assets/images/tile-shower-dark-subway-pony-wall.jpg';
import tub from '../assets/images/bathroom-tub-surround-subway-tile.jpg';
import bedroom from '../assets/images/bedroom-finished-lvp.jpg';

export interface ProjectVideo {
  id: string;
  src: string;
  poster: ImageMetadata;
  title: string;
  description: string;
  /** ISO 8601 duration for VideoObject structured data. */
  duration: string;
  audio: boolean;
  services: string[];
}

export const videos: ProjectVideo[] = [
  {
    id: 'whole-home-interior-remodel', src: '/videos/whole-home-interior-remodel.mp4', poster: wholeHome,
    title: 'Whole-home interior remodel, before and after',
    description: 'Walkthrough of an interior remodel from gutted walls and open framing to insulation, drywall, paint, new doors and LVP flooring.',
    duration: 'PT1M56S', audio: true,
    services: ['drywall', 'insulation', 'painting', 'door-replacement'],
  },
  {
    id: 'two-story-home-flooring-paint-trim', src: '/videos/two-story-home-flooring-paint-trim.mp4', poster: twoStory,
    title: 'New floors, paint and trim through a two-story home',
    description: 'From bare subfloor to wood-look LVP flooring, new stair carpet, white railings, fresh paint, doors and columns.',
    duration: 'PT1M40S', audio: false,
    services: ['tile-lvp-flooring', 'painting', 'carpentry-trim'],
  },
  {
    id: 'kitchen-great-room-ceiling-drywall', src: '/videos/kitchen-great-room-ceiling-drywall.mp4', poster: ceiling,
    title: 'Kitchen and great room ceiling replacement',
    description: 'Our crew takes a kitchen and great room ceiling down to the joists, hangs and finishes new drywall, then walks through the finished rooms.',
    duration: 'PT58S', audio: true,
    services: ['drywall', 'painting'],
  },
  {
    id: 'basement-finishing-drop-ceiling', src: '/videos/basement-finishing-drop-ceiling.mp4', poster: basement,
    title: 'Basement finishing with a drop ceiling',
    description: 'An unfinished basement turned into living space: drywall, a drop ceiling with light panels, paint, LVP flooring, doors and a wrapped post.',
    duration: 'PT57S', audio: true,
    services: ['basement-finishing', 'drop-ceilings', 'tile-lvp-flooring', 'drywall'],
  },
  {
    id: 'custom-tile-shower', src: '/videos/custom-tile-shower.mp4', poster: shower,
    title: 'Custom tile shower walkthrough',
    description: 'A walk-in shower with dark glazed subway tile, a marble basketweave floor, recessed niches and a pony wall with a stone cap.',
    duration: 'PT50S', audio: true,
    services: ['custom-tile-showers', 'bathroom-remodeling'],
  },
  {
    id: 'bathroom-tub-surround-remodel', src: '/videos/bathroom-tub-surround-remodel.mp4', poster: tub,
    title: 'Bathroom remodel: tub surround and tile',
    description: 'A bathroom opened to the studs, then finished with a new tub surround, grey subway tile, paint, vanity and tile floor.',
    duration: 'PT43S', audio: true,
    services: ['bathroom-remodeling', 'custom-tile-showers'],
  },
  {
    id: 'bedroom-remodel-framing-to-finish', src: '/videos/bedroom-remodel-framing-to-finish.mp4', poster: bedroom,
    title: 'Bedroom remodel, framing to finish',
    description: 'A bedroom taken from open framing and insulation to drywall, paint, new doors, a ceiling light and LVP flooring.',
    duration: 'PT26S', audio: false,
    services: ['insulation', 'drywall', 'tile-lvp-flooring'],
  },
];

/** Date the videos were published on this site (VideoObject uploadDate). */
export const VIDEOS_PUBLISHED = '2026-11-11';

export const videosForService = (id: string) => videos.filter((v) => v.services.includes(id));
