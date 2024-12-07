import busboy from "busboy";
import express from "express";
import { readFile } from "fs/promises";
import { buffer } from "node:stream/consumers";
import { fileURLToPath } from "url";
import { nest } from "./index.js";

const app = express();
const PORT = 8080;

app.get("/", async (req, res) => {
  // https://github.com/mpetazzoni/sse.js

  function subscribeToFileInput() {
    const config = { units: "mm", spacing: 4 };
    document.getElementById("upload").addEventListener("change", async (e) => {
      const formData = new FormData();
      formData.append("config", JSON.stringify(config));
      const files = e.target.files;
      for (let i = 0; i < files.length; i++) {
        formData.append(files[i].name, files[i]);
      }
      files.length && subscribeToSeverEvents(formData);
    });
  }

  function subscribeToSeverEvents(data) {
    const evtSource = new EventSource("/nest", {
      withCredentials: true,
      headers: {
        // Do not set content-type, leaving it for the browser to fill in the `multipart/form-data; boundary=....`
      },
      payload: data,
    });
    const progressbar = document.getElementById("nesting-progress");
    const progressLabel = document.querySelector(
      "label[for='nesting-progress']"
    );
    const stopButton = document.getElementById("stop");
    stopButton.addEventListener("click", () => evtSource.close());
    evtSource.addEventListener("open", () => {
      progressbar.setAttribute("value", 50);
      progressLabel.innerHTML = "Connecting";
    });
    evtSource.addEventListener("connection", () => {
      progressbar.setAttribute("value", 100);
    });
    evtSource.addEventListener("progress", (ev) => {
      const { iteration, progress, phase } = JSON.parse(ev.data);
      progressbar.setAttribute("value", progress);
      progressLabel.innerHTML = `${iteration + 1} ${phase}`;
    });
    evtSource.addEventListener("response", (ev) => {
      const { svg, data } = JSON.parse(ev.data);
      // evtSource.close();
      document.getElementById("container").innerHTML = svg;
      document.getElementById("json").innerHTML = JSON.stringify(data, null, 2);
    });
    evtSource.addEventListener("error", () => {
      progressLabel.innerHTML = "ERROR";
    });
  }

  res.contentType("text/html");
  res.end(`
    <script type="module">${(
      await readFile(fileURLToPath(import.meta.resolve("sse.js")))
    ).toString()}
    EventSource = SSE;
    ${subscribeToSeverEvents.toString()}
    ${subscribeToFileInput.toString()}
    subscribeToFileInput();
    </script>
    <input id="upload" type="file" accept="image/svg+xml" multiple />
    <button id="stop">stop</button>
    <label for="nesting-progress">Idle</label>
    <progress id="nesting-progress" value="0" max="100"></progress>
    <div id="container"></div>
    <pre id="json"></pre>
    `);
});

app.post(
  "/nest",
  (req, res, next) => {
    const bb = busboy(req);
    const files = [];
    const fields = {};
    bb.on("file", async (name, file, info) => {
      info.mimeType === "image/svg+xml" &&
        files.push({ name, buffer: await buffer(file) });
    });
    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    bb.on("close", () => {
      req.files = files;
      req.fields = fields;
      next();
    });
    req.pipe(bb);
  },
  async (req, res) => {
    try {
      const abort = await nest(
        req.files.map((file) => ({
          svg: file.buffer.toString(),
          file: file.name,
        })),
        async ({ complete, better, svg, result }) => {
          res.write("event: response\n");
          res.write(
            `data: ${JSON.stringify({
              svg: svg(),
              data: result,
              complete,
              better,
            })}\n\n`
          );
        },
        {
          progressCallback: ({ index, progress, phase }) => {
            res.write("event: progress\n");
            res.write(
              `data: ${JSON.stringify({
                iteration: index,
                progress: Math.round(progress * 100),
                phase,
              })}\n\n`
            );
          },
          ...JSON.parse(req.fields.config || "{}"),
        }
      );

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write("event: connection\n\n");
      res.once("close", abort);
      res.once("end", abort);
    } catch (error) {
      res.status(500).end(error.toString());
    }
  }
);

const server = app.listen(PORT, () => {
  console.log("Server listening on PORT", PORT);
});

process.once("SIGINT", () => server.close());
