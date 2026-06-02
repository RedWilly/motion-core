import {
  createComposition,
  loadBrowserScrawlAdapter,
} from '../../dist/index.js';

const status = document.getElementById('status');

function setStatus(value) {
  if (status !== null) status.textContent = value;
}

async function main() {
  const adapters = await loadBrowserScrawlAdapter({
    canvas: 'simple-canvas',
    namespace: 'exam-simple',
    backgroundColor: '#0b1014',
    fit: 'contain',
  });

  const composition = createComposition(
    {
      name: 'simple',
      width: 960,
      height: 540,
      duration: 4,
      frameRate: 30,
      backgroundColor: '#0b1014',
    },
    adapters,
  );

  composition.addLayer('shape', {
    name: 'background-panel',
    transform: { position: { x: 480, y: 270 }, anchor: { x: 150, y: 90 } },
    shape: {
      kind: 'rectangle',
      width: 300,
      height: 180,
      radius: 18,
      fillStyle: '#1e293b',
    },
  });

  composition.addLayer('shape', {
    name: 'accent-wheel',
    transform: { position: { x: 480, y: 270 }, anchor: { x: 0, y: 0 } },
    shape: {
      kind: 'wheel',
      radius: 58,
      fillStyle: '#38bdf8',
    },
  });

  composition.seek(0);
  setStatus(`Layers: ${composition.layers.length}`);
}

main().catch((error) => {
  console.error(error);
  setStatus(error instanceof Error ? error.message : 'Failed');
});
