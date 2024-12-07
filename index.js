const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { DOMParser, XMLSerializer, document } = window;

Object.assign(global, { DOMParser, XMLSerializer, window, document });

const { DeepNest } = require("./main/deepnest");
const SvgParser = require("./main/svgparser");
const { Worker } = require("worker_threads");
const path = require("path");

const eventEmitter = new EventTarget();

function nestingToSVG(
  deepNest,
  placementResult,
  title = "Nesting result",
  dxf = false
) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const titleEl = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "title"
  );
  titleEl.innerHTML = title;
  svg.appendChild(titleEl);

  var svgwidth = 0;
  var svgheight = 0;

  // create elements if they don't exist, show them otherwise
  placementResult.placements.forEach(function (s) {
    var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(group);

    var sheetbounds = deepNest.parts[s.sheet].bounds;

    group.setAttribute(
      "transform",
      "translate(" + -sheetbounds.x + " " + (svgheight - sheetbounds.y) + ")"
    );
    if (svgwidth < sheetbounds.width) {
      svgwidth = sheetbounds.width;
    }

    s.sheetplacements.forEach(function (p) {
      var part = deepNest.parts[p.source];
      var partgroup = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "g"
      );

      !part && console.error("TODO: unknown bug", part, p);
      part?.svgelements.forEach(function (e, index) {
        var node = e.cloneNode(false);
        if (
          (node.tagName === "polyline" || node.tagName === "polygon") &&
          !node.points
        ) {
          node.points = SvgParser.parsePolyPoints(node);
        } else if (node.tagName === "path") {
          Object.setPrototypeOf(node, window.SVGPathElement.prototype);
        }

        if (placementResult.tagName == "image") {
          var relpath = placementResult.getAttribute("data-href");
          if (relpath) {
            placementResult.setAttribute("href", relpath);
          }
          placementResult.removeAttribute("data-href");
        }
        partgroup.appendChild(node);
      });

      group.appendChild(partgroup);

      // position part
      partgroup.setAttribute(
        "transform",
        "translate(" + p.x + " " + p.y + ") rotate(" + p.rotation + ")"
      );
      partgroup.setAttribute("id", p.id);
    });

    // put next sheet below
    svgheight += 1.1 * sheetbounds.height;
  });

  const { units, scale, mergeLines, dxfExportScale, curveTolerance } =
    deepNest.config();
  const ratio =
    (units === "mm" ? 1 / 25.4 : 1) /
    // inkscape on server side
    (dxf ? dxfExportScale : 1);

  svg.setAttribute(
    "width",
    `${svgwidth / (scale * ratio)}${units == "inch" ? "in" : "mm"}`
  );
  svg.setAttribute(
    "height",
    `${svgheight / (scale * ratio)}${units == "inch" ? "in" : "mm"}`
  );
  svg.setAttribute("viewBox", `0 0 ${svgwidth} ${svgheight}`);

  if (mergeLines && placementResult.mergedLength > 0) {
    SvgParser.applyTransform(svg);
    SvgParser.flatten(svg);
    SvgParser.splitLines(svg);
    SvgParser.mergeOverlap(svg, 0.1 * curveTolerance);
    SvgParser.mergeLines(svg);

    // set stroke and fill for all
    Array.from(svg.children).forEach(function (e) {
      if (e.tagName != "g" && e.tagName != "image") {
        e.setAttribute("fill", "none");
        e.setAttribute("stroke", "#000000");
      }
    });
  }

  return new XMLSerializer().serializeToString(svg);
}

async function nest(
  svgInput,
  callback,
  {
    units = "mm",
    scale = 72,
    spacing = 4,
    sheet = { width: 3000, height: 1000 },
    timeout = 0,
    progressCallback,
    ...config
  } = {}
) {
  // scale is stored in units/inch
  const ratio = units === "mm" ? 1 / 25.4 : 1;
  const deepNestConfig = {
    ...config,
    units,
    scale,
    spacing: spacing * ratio * scale, // stored value will be in units/inch
    curveTolerance: 0.72, // store distances in native units
    clipperScale: 10000000,
    rotations: 4,
    threads: 4,
    populationSize: 10,
    mutationRate: 10,
    placementType: "gravity", // how to place each part (possible values gravity, box, convexhull)
    mergeLines: true, // whether to merge lines
    timeRatio: 0.5, // ratio of material reduction to laser time. 0 = optimize material only, 1 = optimize laser time only
    simplify: false,
    dxfImportScale: 1,
    dxfExportScale: 72,
    endpointTolerance: 0.36,
    conversionServer: "http://convert.deepnest.io",
  };
  const deepNest = new DeepNest(eventEmitter, deepNestConfig);
  const worker = new Worker(path.resolve("./main/background.js"));
  eventEmitter.addEventListener("background-start", ({ detail: data }) =>
    worker.postMessage(data)
  );
  worker.on("message", ({ type, data }) =>
    eventEmitter.dispatchEvent(new CustomEvent(type, { detail: data }))
  );
  const [sheetSVG] = deepNest.importsvg(
    null,
    null,
    `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${
      sheet.width * ratio * scale
    }" height="${sheet.height * ratio * scale}" class="sheet"/></svg>`
  );
  sheetSVG.sheet = true;
  const elements = svgInput
    .map((input) =>
      typeof input === "object"
        ? deepNest.importsvg(
            path.basename(input.file),
            path.dirname(input.file),
            input.svg
          )
        : deepNest.importsvg(null, null, input)
    )
    .flat();
  if (elements.length === 0) {
    throw new Error("Nothing to nest");
  }

  eventEmitter.addEventListener("background-progress", ({ detail }) => {
    detail.progress >= 0 && progressCallback(detail);
  });

  let t = 0;
  const abort = async () => {
    clearTimeout(t);
    deepNest.stop();
    await worker.terminate();
  };
  t = timeout && setTimeout(abort, timeout);
  process.on("SIGINT", abort);

  eventEmitter.addEventListener("placement", ({ detail: { data, better } }) => {
    const result = data.placements.flatMap(({ sheetplacements }) =>
      sheetplacements.slice().sort((a, b) => a.id - b.id)
    );
    return callback({
      result,
      data,
      elements,
      status: {
        better,
        complete: result.length === elements.length,
        placed: result.length,
        total: elements.length,
      },
      svg: () =>
        nestingToSVG(deepNest, data, `${result.length}/${elements.length}`),
      abort,
    });
  });

  deepNest.start();

  return abort;
}

module.exports = { nest };
