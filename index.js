const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
const { DOMParser, XMLSerializer, document } = window;

Object.assign(global, { DOMParser, XMLSerializer, window, document });

const { DeepNest } = require("./main/deepnest");
const SvgParser = require("./main/svgparser");
const { processNesting } = require("./main/background");
const { readFile, writeFile } = require("fs/promises");
const path = require("path");

const eventEmitter = new EventTarget();

function nestingToSVG(deepNest, placementResult, dxf = false) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

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

      part.svgelements.forEach(function (e, index) {
        var node = e.cloneNode(false);

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

  const { units, scale, mergeLines, dxfExportScale } = deepNest.config();
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
    SvgParser.mergeOverlap(svg, 0.1 * config.getSync("curveTolerance"));
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
    iterations = 1,
    units = "mm",
    scale = 72,
    spacing = 4,
    sheet = { width: 3000, height: 1000 },
    timeout = 0,
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
  processNesting(eventEmitter);
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

  eventEmitter.addEventListener(
    "background-progress",
    ({ detail: { index, progress } }) => {
      progress >= 0 &&
        console.info(`iteration(${index}) at ${Math.round(progress * 100)}%`);
    }
  );

  const t = timeout && setTimeout(() => deepNest.stop(), timeout);

  let i = 0;
  eventEmitter.addEventListener(
    "placement",
    ({ detail: { data, accepted } }) => {
      if (
        !accepted ||
        data.placements.flatMap((p) => p.sheetplacements).length <
          elements.length
      ) {
        // result is not better
        return;
      }

      if (++i === iterations) {
        clearTimeout(t);
        deepNest.stop();
      }

      return callback(
        {
          iteration: i,
          result: data.placements.flatMap(({ sheetplacements }) =>
            sheetplacements.slice().sort((a, b) => a.id - b.id)
          ),
          data,
          elements,
        },
        deepNest
      );
    }
  );

  process.once("SIGINT", () => {
    clearTimeout(t);
    deepNest.stop();
  });

  deepNest.start();
}

module.exports = { nest, nestingToSVG };
