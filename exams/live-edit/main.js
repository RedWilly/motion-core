import {
  blur,
  createComposition,
  createGsapTimelineFactory,
  loadBrowserScrawlAdapter,
} from '../../dist/index.js';
import { gsap } from 'gsap';

const status = document.getElementById('status');
const playToggle = document.getElementById('play-toggle');
const timelineInput = document.getElementById('timeline');
const autoKeyInput = document.getElementById('auto-key');

const controls = {
  x: document.getElementById('position-x'),
  y: document.getElementById('position-y'),
  rotation: document.getElementById('rotation'),
  scale: document.getElementById('scale-x'),
  opacity: document.getElementById('opacity'),
  blur: document.getElementById('blur-radius'),
  fill: document.getElementById('fill-opacity'),
  stroke: document.getElementById('stroke-width'),
};

function setStatus(value) {
  if (status !== null) status.textContent = value;
}

function numberInput(input) {
  return Number.parseFloat(input.value);
}

function setInput(input, value) {
  input.value = String(Number.isFinite(value) ? value : 0);
}

async function main() {
  const adapters = await loadBrowserScrawlAdapter({
    canvas: 'live-edit-canvas',
    namespace: 'exam-live-edit',
    backgroundColor: '#0f1418',
    fit: 'contain',
  });
  adapters.createTimeline = createGsapTimelineFactory(gsap);

  const composition = createComposition(
    {
      name: 'live-edit',
      width: 960,
      height: 540,
      duration: 4,
      frameRate: 60,
      backgroundColor: '#0f1418',
    },
    adapters,
  );

  composition.addLayer('shape', {
    name: 'stage',
    transform: { position: { x: 480, y: 270 }, anchor: { x: 380, y: 200 } },
    shape: {
      kind: 'rectangle',
      width: 760,
      height: 400,
      radius: 20,
      fillStyle: '#17212b',
      strokeStyle: '#314256',
      lineWidth: 2,
    },
  });

  const gradient = composition.createGradient({
    id: 'live-fill',
    colors: [
      [0, '#38bdf8'],
      [520, '#f97316'],
      [999, '#facc15'],
    ],
    startX: -80,
    startY: -60,
    endX: 80,
    endY: 60,
    paletteStart: 0,
    paletteEnd: 999,
  });

  const shape = composition.addLayer('shape', {
    name: 'editable-wheel',
    transform: { position: { x: 260, y: 270 }, anchor: { x: 0, y: 0 } },
    opacity: 0.88,
    shape: {
      kind: 'wheel',
      radius: 62,
      fill: { style: gradient, opacity: 1 },
      stroke: { color: '#f8fafc', opacity: 1, width: 4 },
    },
    effects: [
      blur({ id: 'live-blur', radius: 0 }),
    ],
  });

  const label = composition.addLayer('text', {
    text: 'edit me live',
    name: 'caption',
    transform: { position: { x: 480, y: 432 }, anchor: { x: 0, y: 0 } },
    scrawl: {
      fontString: '24px system-ui, sans-serif',
      fillStyle: '#dbeafe',
    },
  });

  const blurEffect = shape.effects[0];
  const fill = shape.shape?.fill;
  const stroke = shape.shape?.stroke;

  composition.addKeyframe(shape, 'position.x', 0, 260);
  composition.addKeyframe(shape, 'position.x', 4, 700, { easing: 'power2.inOut' });
  composition.addKeyframe(shape, 'rotation', 0, 0);
  composition.addKeyframe(shape, 'rotation', 4, 360, { easing: 'power1.inOut' });
  composition.animate(label, { 'position.y': 404 }, {
    duration: 1.2,
    repeat: -1,
    yoyo: true,
    easing: 'power1.inOut',
  });

  const editOptions = () => autoKeyInput?.checked
    ? { mode: 'autoKey', time: composition.timeline.time() }
    : { mode: 'set' };

  function bindLayerControl(input, property) {
    input.addEventListener('input', () => {
      composition.set(shape, property, numberInput(input), {
        ...editOptions(),
        render: true,
      });
      updateStatus();
    });
  }

  function bindEffectControl(input, effect, key) {
    input.addEventListener('input', () => {
      composition.set(effect.values, key, numberInput(input), {
        ...editOptions(),
        render: true,
      });
      updateStatus();
    });
  }

  function bindShapeFillControl(input, property) {
    input.addEventListener('input', () => {
      if (shape.shape?.fill === undefined) return;
      composition.set(shape.shape.fill.values, property, numberInput(input), {
        ...editOptions(),
        render: true,
      });
      updateStatus();
    });
  }

  function bindShapeStrokeControl(input, property) {
    input.addEventListener('input', () => {
      if (shape.shape?.stroke === undefined) return;
      composition.set(shape.shape.stroke.values, property, numberInput(input), {
        ...editOptions(),
        render: true,
      });
      updateStatus();
    });
  }

  bindLayerControl(controls.x, 'position.x');
  bindLayerControl(controls.y, 'position.y');
  bindLayerControl(controls.rotation, 'rotation');
  bindLayerControl(controls.scale, 'scale.x');
  bindLayerControl(controls.opacity, 'opacity');

  if (blurEffect !== undefined) {
    bindEffectControl(controls.blur, blurEffect, 'radius');
  }
  if (fill !== undefined) {
    bindShapeFillControl(controls.fill, 'opacity');
  }
  if (stroke !== undefined) {
    bindShapeStrokeControl(controls.stroke, 'width');
  }

  document.getElementById('key-start')?.addEventListener('click', () => {
    addKeysAt(0);
    updateStatus('Added keyframes at 0s');
  });

  document.getElementById('key-end')?.addEventListener('click', () => {
    addKeysAt(4);
    updateStatus('Added keyframes at 4s');
  });

  document.getElementById('edit-key')?.addEventListener('click', () => {
    editKeysAt(composition.timeline.time());
    updateStatus(`Edited keyframes at ${composition.timeline.time().toFixed(2)}s`);
  });

  document.getElementById('seek-start')?.addEventListener('click', () => seekTo(0));
  document.getElementById('seek-mid')?.addEventListener('click', () => seekTo(2));
  document.getElementById('seek-end')?.addEventListener('click', () => seekTo(4));

  timelineInput?.addEventListener('input', () => {
    seekTo(numberInput(timelineInput));
  });

  playToggle?.addEventListener('click', () => {
    if (playToggle.dataset.playing === 'true') {
      composition.pause();
      playToggle.dataset.playing = 'false';
      playToggle.textContent = 'Play';
    } else {
      composition.play();
      playToggle.dataset.playing = 'true';
      playToggle.textContent = 'Pause';
    }
    updateStatus();
  });

  function addKeysAt(time) {
    composition.addKeyframe(shape, 'position.x', time, numberInput(controls.x));
    composition.addKeyframe(shape, 'position.y', time, numberInput(controls.y));
    composition.addKeyframe(shape, 'rotation', time, numberInput(controls.rotation));
    composition.addKeyframe(shape, 'scale.x', time, numberInput(controls.scale));
    composition.addKeyframe(shape, 'opacity', time, numberInput(controls.opacity));
  }

  function editKeysAt(time) {
    composition.editKeyframe(shape, 'position.x', time, numberInput(controls.x));
    composition.editKeyframe(shape, 'position.y', time, numberInput(controls.y));
    composition.editKeyframe(shape, 'rotation', time, numberInput(controls.rotation));
    composition.editKeyframe(shape, 'scale.x', time, numberInput(controls.scale));
    composition.editKeyframe(shape, 'opacity', time, numberInput(controls.opacity));
  }

  function seekTo(time) {
    composition.seek(time);
    syncControlsFromState();
    updateStatus();
  }

  function syncControlsFromState() {
    setInput(controls.x, shape.transform.position.x);
    setInput(controls.y, shape.transform.position.y);
    setInput(controls.rotation, shape.transform.rotation);
    setInput(controls.scale, shape.transform.scale.x);
    setInput(controls.opacity, shape.opacity);
    if (timelineInput !== null) setInput(timelineInput, composition.timeline.time());
    if (blurEffect !== undefined) setInput(controls.blur, blurEffect.values.radius ?? 0);
    if (fill !== undefined) setInput(controls.fill, fill.values.opacity);
    if (stroke !== undefined) setInput(controls.stroke, stroke.values.width);
  }

  function updateStatus(message) {
    const mode = autoKeyInput?.checked ? 'auto-key' : 'set';
    setStatus(message ?? `${mode}, time ${composition.timeline.time().toFixed(2)}s, layers ${composition.layers.length}`);
  }

  syncControlsFromState();
  composition.seek(0);
  updateStatus('Ready');
}

main().catch((error) => {
  console.error(error);
  setStatus(error instanceof Error ? error.message : 'Failed');
});
