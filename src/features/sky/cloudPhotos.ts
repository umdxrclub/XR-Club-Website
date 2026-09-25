import type { ImageMetadata } from 'astro';
import outdoor from '../../assets/home/hololens-demo.jpg';
import robot from '../../assets/sky/robot-demo.png';
import community from '../../assets/sky/community-vr.png';
import nasa from '../../assets/sky/community-nasa.jpg';
import oculus from '../../assets/sky/history-oculus.png';
import iribe from '../../assets/sky/history-iribe.jpg';
import partners from '../../assets/sky/partners-talk-full.jpg';

import quest from '../../assets/sky/build-quest-demo.jpeg';
import treadmill from '../../assets/sky/build-treadmill.jpeg';
import immersive from '../../assets/sky/build-immersive-room.jpeg';
import members from '../../assets/sky/community-members.jpeg';
import workshop from '../../assets/sky/community-workshop.jpeg';
import showcase from '../../assets/sky/community-showcase.jpeg';
import demoNight from '../../assets/sky/community-demo-night.jpeg';
import earlyClub from '../../assets/sky/history-club.avif';
import lab from '../../assets/sky/history-lab.webp';
import founders from '../../assets/sky/history-founders.jpg';

type StoryPhoto = { image: ImageMetadata; alt: string; shape: 'tab' | 'fold' | 'notch' | 'step'; position?: string };
export const cloudPhotos: Record<string, readonly StoryPhoto[]> = {
  about: [
    { image: outdoor, alt: 'A person exploring a HoloLens outdoors, with both hands raised.', shape: 'tab' },
    { image: robot, alt: 'A four-legged robot at a student technology demonstration.', shape: 'fold', position: '50% 52%' },
    { image: quest, alt: 'A visitor trying a Quest headset while students watch in the lab.', shape: 'tab' },
    { image: treadmill, alt: 'A student trying the VR treadmill during a lab demonstration.', shape: 'fold' },
    { image: immersive, alt: 'Visitors exploring an immersive room filled with blue projected light.', shape: 'tab' },
  ],
  community: [
    { image: community, alt: 'A young visitor trying a VR headset and controllers at an XR event.', shape: 'fold' },
    { image: nasa, alt: 'The NASA SUITS community together at Test Week 2023.', shape: 'tab' },
    { image: members, alt: 'Three XR Club members together at an event.', shape: 'tab' },
    { image: workshop, alt: 'Students working together around a laptop in the XR lab.', shape: 'fold' },
    { image: showcase, alt: 'A visitor using the VR treadmill at a campus showcase.', shape: 'tab' },
    { image: demoNight, alt: 'Students sharing a VR demonstration at a club event.', shape: 'fold' },
  ],
  history: [
    { image: oculus, alt: 'A group of event attendees at the Oculus booth.', shape: 'tab' },
    { image: iribe, alt: 'The Brendan Iribe Center at the University of Maryland at dusk.', shape: 'fold', position: '50% 65%' },
    { image: earlyClub, alt: 'XR Club members sharing VR headsets in an earlier club lab.', shape: 'fold' },
    { image: lab, alt: 'The XR Club lab with its Oculus banner and pink lighting.', shape: 'tab' },
    { image: founders, alt: 'Galen and Mikhail beside a virtual reality display at an early club event.', shape: 'fold' },
  ],
  sponsors: [
    { image: partners, alt: 'Shell Talk: Beyond Pixels, a talk with Russell Mehta at the Idea Factory and Startup Shell.', shape: 'tab' },
  ],
};

// Shallow tabs leave the photographs' subjects intact.
export const photoContours = {
  notch: 'M.03 0H.77Q.79 0 .8 .016L.827 .049Q.84 .065 .86 .065H.97Q1 .065 1 .095V.97Q1 1 .97 1H.21Q.19 1 .18 .984L.15 .95Q.14 .935 .12 .935H.03Q0 .935 0 .905V.03Q0 0 .03 0Z',
  step: 'M.2 0H.97Q1 0 1 .03V.91Q1 .94 .97 .94H.78Q.76 .94 .75 .954L.72 .987Q.71 1 .69 1H.03Q0 1 0 .97V.09Q0 .06 .03 .06H.12Q.14 .06 .15 .043L.18 .009Q.19 0 .2 0Z',
  tab: 'M.025 0H.31Q.323 0 .333 .01L.355 .027Q.365 .035 .38 .035H.975Q1 .035 1 .069V.969Q1 1 .975 1H.025Q0 1 0 .969V.033Q0 0 .025 0Z',
  fold: 'M.276 0H.975Q1 0 1 .033V.932Q1 .943 .990 .953L.956 .988Q.944 1 .929 1H.025Q0 1 0 .969V.068Q0 .035 .025 .035H.221Q.234 .035 .243 .024L.260 .008Q.267 0 .276 0Z',
};
export const photoMask = (shape: keyof typeof photoContours) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" preserveAspectRatio="none"><path fill="white" d="${photoContours[shape]}"/></svg>`)}")`;
