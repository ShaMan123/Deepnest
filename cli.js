const { JSDOM } = require("jsdom");
const { window } = new JSDOM();
global.window = window;

const { DeepNest } = require("./main/deepnest");
const SvgParser = require("./main/svgparser");
const { processNesting } = require("./main/background");
const { readFile, writeFile } = require("fs/promises");
const path = require("path");
const { ensureDir } = require("fs-extra");

const eventEmitter = new EventTarget();
const { DOMParser, XMLSerializer, document } = window;

/**
 * @type DOMParser
 */
global.DOMParser = DOMParser;

function exportNest(deepNest, placementResult, dxf = false) {
  var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  var svgwidth = 0;
  var svgheight = 0;

  // create elements if they don't exist, show them otherwise
  placementResult.placements.forEach(function (s) {
    var group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.appendChild(group);
    /*deepNest.parts[s.sheet].svgelements.forEach(function(e){
            var node = e.cloneNode(false);
            node.setAttribute('stroke', '#000');
            node.setAttribute('fill', 'none');
            group.appendChild(node);
        });*/

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

  const { units, scale, mergeLines } = deepNest.config;

  if (dxf) {
    scale /= Number(config.getSync("dxfExportScale")); // inkscape on server side
  }

  if (units == "mm") {
    scale /= 25.4;
  }

  svg.setAttribute("width", svgwidth / scale + (units == "inch" ? "in" : "mm"));
  svg.setAttribute(
    "height",
    svgheight / scale + (units == "inch" ? "in" : "mm")
  );
  svg.setAttribute("viewBox", "0 0 " + svgwidth + " " + svgheight);

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

async function main() {
  const deepNest = new DeepNest(eventEmitter);
  processNesting(eventEmitter);
  const { units, scale: scaleInput } = deepNest.config();
  // scale is stored in units/inch
  const scale = scaleInput * (units === "mm" ? 1 / 25.4 : 1);
  const sheet = { width: 10, height: 10 };
  const filepath = path.resolve("./input/letters3.svg");
  const [sheetSVG] = deepNest.getParts(
    Array.from(
      new DOMParser()
        .parseFromString(
          `<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="${
            sheet.width * scale
          }" height="${sheet.height * scale}" class="sheet"/></svg>`,
          "image/svg+xml"
        )
        .children.item(0).children
    )
  );
  sheetSVG.sheet = true;
  deepNest.parts.push(sheetSVG);
  deepNest.importsvg(
    path.basename(filepath),
    path.dirname(filepath),
    (await readFile(filepath)).toString()
  );
  // const parts = deepNest.getParts(
  //   Array.from(
  //     new DOMParser()
  //       .parseFromString((await readFile(filepath)).toString(), "image/svg+xml")
  //       .children.item(0).children
  //   ).map((g) => {
  //     const values = g.firstChild
  //       .getAttribute("points")
  //       .split(/\s+|,/)
  //       .map((q) => Number(q));
  //     const points = new Array(values.length / 2)
  //       .fill(0)
  //       .map((_, i) => ({ x: values[i * 2], y: values[i * 2 + 1] }));
  //     return Object.assign(g.firstChild, {
  //       points,
  //     });
  //   }),
  //   filepath
  // );
  // deepNest.parts.push(sheetSVG, ...parts);

  eventEmitter.addEventListener("setPlacements", async ({ detail }) => {
    if (
      deepNest.nests.length > 0 &&
      deepNest.nests[0].fitness <= detail.fitness
    ) {
      // result is not better
      return;
    }
    const outputDir = path.resolve("./output");
    await ensureDir(outputDir);
    const out = {
      svg: path.resolve(outputDir, "result.svg"),
      json: path.resolve(outputDir, "data.json"),
    };
    await writeFile(out.svg, exportNest(deepNest, detail));
    await writeFile(out.json, JSON.stringify(detail, null, 2));
    deepNest.stop();
    console.log("Successfully written files:", out);
  });
  deepNest.start();
}

main();
