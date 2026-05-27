import {
  createAnimationController,
  createComposition,
  createGsapTimelineFactory,
  effectPresets,
  loadBrowserScrawlAdapter,
} from '../../dist/index.js';
import { gsap } from 'gsap';

const status = document.getElementById('status');

function setStatus(value) {
  if (status !== null) status.textContent = value;
}

async function main() {
  const adapters = await loadBrowserScrawlAdapter({
    canvas: 'animation-canvas',
    namespace: 'exam-animation',
    backgroundColor: '#101114',
    fit: 'contain',
  });
  adapters.createTimeline = createGsapTimelineFactory(gsap);

  const composition = createComposition(
    {
      name: 'animation',
      width: 960,
      height: 540,
      duration: 6,
      frameRate: 60,
      backgroundColor: '#101114',
    },
    adapters,
  );

  const stage = composition.addLayer('shape', {
    name: 'stage',
    transform: { position: { x: 480, y: 270 }, anchor: { x: 360, y: 190 } },
    shape: {
      kind: 'rectangle',
      width: 720,
      height: 380,
      radius: 22,
      fillStyle: '#324263',
      strokeStyle: '#334155',
    },
  });

  const orb = composition.addLayer('shape', {
    name: 'animated-orb',
    transform: { position: { x: 260, y: 270 }, anchor: { x: 0, y: 0 } },
    shape: {
      kind: 'wheel',
      radius: 54,
      fillStyle: '#f97316',
    },
    effects: [
      effectPresets.blur({ id: 'soft-edge', radius: 2 }),
      effectPresets.saturation({ id: 'warmth', level: 1.25 }),
    ],
  });

  const label = composition.addLayer('text', {
    name: 'label',
    transform: { position: { x: 480, y: 420 }, anchor: { x: 0, y: 0 } },
    text: 'motion-core + Scrawl-canvas',
    scrawl: {
      fontString: '26px system-ui, sans-serif',
      fillStyle: '#e5e7eb',
    },
  });

  const controller = createAnimationController(composition);
  controller.animate(orb, {
    'position.x': 700,
    rotation: 360,
    opacity: 0.74,
  }, {
    duration: 2.4,
    easing: 'power2.inOut',
    repeat: -1,
    yoyo: true,
  });
  controller.animate(label, {
    'position.y': 398,
  }, {
    duration: 1.4,
    easing: 'power1.inOut',
    repeat: -1,
    yoyo: true,
  });

  composition.seek(0);
  composition.play();
  setStatus(`Playing through composition.play(), layers: ${composition.layers.length}, stage: ${stage.name}`);
}

main().catch((error) => {
  console.error(error);
  setStatus(error instanceof Error ? error.message : 'Failed');
});
