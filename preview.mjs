import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "dist");
const port = Number(process.env.PORT || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function resolvePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  let rel = clean;
  if (rel.endsWith("/")) rel += "index.html";
  else if (!extname(rel)) rel += "/index.html";
  const full = normalize(join(root, rel));
  const fromRoot = relative(root, full);
  if (fromRoot.startsWith("..") || fromRoot.includes(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    return null;
  }
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const full = resolvePath(req.url || "/");
    if (!full) {
      res.writeHead(400);
      res.end("bad path");
      return;
    }
    const body = await readFile(full);
    res.writeHead(200, {
      "Content-Type": types[extname(full)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`preview http://127.0.0.1:${port}`);
});
