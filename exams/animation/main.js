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

  const stage = composition.addShape({
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

  const orbGradient = composition.createGradient({
    id: 'orb-gradient',
    colors: [
      [0, '#f97316'],
      [520, '#facc15'],
      [999, '#fb7185'],
    ],
    startX: -60,
    startY: 0,
    endX: 60,
    endY: 0,
    paletteStart: 0,
    paletteEnd: 999,
  });

  const orb = composition.addShape({
    name: 'animated-orb',
    transform: { position: { x: 260, y: 270 }, anchor: { x: 0, y: 0 } },
    shape: {
      kind: 'wheel',
      radius: 54,
      fill: { style: orbGradient, opacity: 0 },
      stroke: { color: '#ffffff', opacity: 1, width: 3 },
    },
    effects: [
      effectPresets.blur({ id: 'soft-edge', radius: 0 }),
      effectPresets.saturation({ id: 'warmth', level: 1.25 }),
    ],
  });

  const label = composition.addText('motion-core + Scrawl-canvas', {
    name: 'label',
    transform: { position: { x: 480, y: 420 }, anchor: { x: 0, y: 0 } },
    scrawl: {
      fontString: '26px system-ui, sans-serif',
      fillStyle: '#e5e7eb',
    },
  });

  const controller = createAnimationController(composition);
  const blur = orb.effects[0];
  const fill = orb.shape?.fill;
  const stroke = orb.shape?.stroke;
  controller.animateTarget(orbGradient, {
    paletteStart: 180,
    paletteEnd: 819,
  }, {
    duration: 1.6,
    easing: 'power1.inOut',
    repeat: -1,
    yoyo: true,
  });
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
  if (fill !== undefined) {
    controller.animateTarget(fill, {
      opacity: 1,
    }, {
      duration: 1.1,
      easing: 'power2.out',
    });
  }
  if (stroke !== undefined) {
    controller.animateTarget(stroke, {
      width: 10,
    }, {
      duration: 0.7,
      easing: 'power2.inOut',
      repeat: -1,
      yoyo: true,
    });
  }
  if (blur !== undefined) {
    controller.animateTarget(blur, {
      radius: 8,
    }, {
      duration: 1.2,
      easing: 'power2.inOut',
      repeat: -1,
      yoyo: true,
    });
  }
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
