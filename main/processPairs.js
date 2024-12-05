const {
  Worker,
  isMainThread,
  parentPort,
  workerData,
} = require("worker_threads");
const ClipperLib = require("./util/clipper");
const { GeometryUtil } = require("./util/geometryutil");

function toClipperCoordinates(polygon) {
  var clone = [];
  for (var i = 0; i < polygon.length; i++) {
    clone.push({
      X: polygon[i].x,
      Y: polygon[i].y,
    });
  }

  return clone;
}

function toNestCoordinates(polygon, scale) {
  var clone = [];
  for (var i = 0; i < polygon.length; i++) {
    clone.push({
      x: polygon[i].X / scale,
      y: polygon[i].Y / scale,
    });
  }

  return clone;
}

function rotatePolygon(polygon, degrees) {
  var rotated = [];
  var angle = (degrees * Math.PI) / 180;
  for (var i = 0; i < polygon.length; i++) {
    var x = polygon[i].x;
    var y = polygon[i].y;
    var x1 = x * Math.cos(angle) - y * Math.sin(angle);
    var y1 = x * Math.sin(angle) + y * Math.cos(angle);

    rotated.push({ x: x1, y: y1 });
  }

  return rotated;
}

function processPair(pair) {
  var A = rotatePolygon(pair.A, pair.Arotation);
  var B = rotatePolygon(pair.B, pair.Brotation);

  var clipper = new ClipperLib.Clipper();

  var Ac = toClipperCoordinates(A);
  ClipperLib.JS.ScaleUpPath(Ac, 10000000);
  var Bc = toClipperCoordinates(B);
  ClipperLib.JS.ScaleUpPath(Bc, 10000000);
  for (var i = 0; i < Bc.length; i++) {
    Bc[i].X *= -1;
    Bc[i].Y *= -1;
  }
  var solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
  var clipperNfp;

  var largestArea = null;
  for (i = 0; i < solution.length; i++) {
    var n = toNestCoordinates(solution[i], 10000000);
    var sarea = -GeometryUtil.polygonArea(n);
    if (largestArea === null || largestArea < sarea) {
      clipperNfp = n;
      largestArea = sarea;
    }
  }

  for (var i = 0; i < clipperNfp.length; i++) {
    clipperNfp[i].x += B[0].x;
    clipperNfp[i].y += B[0].y;
  }

  pair.A = null;
  pair.B = null;
  pair.nfp = clipperNfp;
  return pair;
}

function processPairs(pairs, { signal, threadCount = 4 } = {}) {
  return new Promise((resolve, reject) => {
    if (isMainThread) {
      const result = [];
      const threads = new Set();
      // console.log(`Running with ${threadCount} threads...`);
      const pairsPerWorker = Math.ceil(pairs.length / threadCount);
      for (let i = 0; i < threadCount - 1; i++) {
        const start = pairsPerWorker * i;
        threads.add(
          new Worker(__filename, {
            workerData: { pairs: pairs.slice(start, start + pairsPerWorker) },
          })
        );
      }
      for (let worker of threads) {
        worker.on("error", reject);
        worker.on("exit", () => {
          threads.delete(worker);
          // console.log(`Thread exiting, ${threads.size} running...`);
          if (threads.size === 0) {
            resolve(result);
          }
        });
        worker.on("message", (data) => {
          result.push(...data);
        });
      }
      signal.addEventListener('abort', () => {
        const workers = Array.from(threads.values());
        // console.log('Terminating pair process workers', workers.length);
        threads.clear();
        return Promise.all(workers.map(worker => worker.terminate()));
      })
    } else {
      parentPort.postMessage(workerData.pairs.map(processPair));
    }
  });
}

module.exports = { processPairs };
