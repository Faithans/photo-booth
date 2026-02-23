import express from "express";
import { execFile } from "child_process";
import sharp from "sharp";
import fs from "fs";
import path from "path";

const outputDir = "/Users/bytedance/Documents/Project/selfie/output";
const app = express();
const PORT = 3000;

const photoRoot = "/Users/bytedance/Pictures/FUJIFILM";
const capture3Script =
  "/Users/bytedance/Documents/Project/selfie/capture3.scpt";
const printScript = "/Users/bytedance/Documents/Project/selfie/print.scpt";

let lastPrintPath = null;

app.use("/output", express.static(outputDir));
app.use(express.json());

app.use(
  "/public",
  express.static("/Users/bytedance/Documents/Project/selfie/public"),
);

// Serve photos to iPad
app.use("/photos", express.static(photoRoot));

let busy = false;
let lastPhotoFullPath = null; // server-side "current preview"

// ---- small helpers ----
function isUnderPhotoRoot(fullPath) {
  const resolved = path.resolve(fullPath);
  const rootResolved = path.resolve(photoRoot) + path.sep;
  return resolved.startsWith(rootResolved);
}

function ensureExists(p) {
  return fs.existsSync(p);
}

// ---- UI ----
app.get("/", (req, res) => {
  res.send(`<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root{
    --ctrl-h: 104px;
  --ctrl-pad: 80px; /* ✅ 額外預留 */
      --eva-green: #00FF66;
      --eva-bg1: #2A003F;
      --eva-bg2: #120018;
    }

    html, body{
      height: 100%;
      overflow: hidden;
    }

    body{
      margin: 0;
      background: radial-gradient(circle at center, var(--eva-bg1) 0%, var(--eva-bg2) 60%, #000 100%);
      color: var(--eva-green);
      font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Helvetica, Arial, sans-serif;
    }

    /* scanline - 不吃觸控 */
    body::after{
      content:"";
      position: fixed;
      inset: 0;
      background: repeating-linear-gradient(
        to bottom,
        rgba(0,0,0,0.18) 0px,
        rgba(0,0,0,0.18) 2px,
        transparent 2px,
        transparent 5px
      );
      pointer-events: none;
      z-index: 0;
    }

    /* 內容區 */
    #main{
      height: 100%;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
  padding: 44px 18px calc(var(--ctrl-h) + var(--ctrl-pad) + env(safe-area-inset-bottom)) 18px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 18px;
      position: relative;
      z-index: 1;
    }

    /* 更大、更有衝擊力：用 clamp 依螢幕縮放 */
    h1{
      margin: 0;
      text-align: center;
      letter-spacing: 6px;
      font-weight: 800;
      font-size: clamp(44px, 6vw, 76px);
      text-shadow:
        0 0 10px rgba(0,255,102,0.8),
        0 0 28px rgba(0,255,102,0.7),
        0 0 60px rgba(0,255,102,0.35);
    }

    h2{
      margin: 0;
      text-align: center;
      letter-spacing: 4px;
      font-size: clamp(18px, 2.6vw, 28px);
      opacity: 0.9;
      text-shadow: 0 0 16px rgba(0,255,102,0.25);
    }

    /* 中間主視覺：你的照片 */
.hero{
  width: 78vw;
  max-width: 520px;
  aspect-ratio: 4/5;
  position: relative;
  margin: 30px auto;
}

.hero-inner{
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 16px;

  /* EVA 紫黑底 */
  background:
    radial-gradient(circle at 50% 35%, rgba(0,255,102,0.18), transparent 60%),
    radial-gradient(circle at 50% 50%, #2A003F 0%, #120018 70%, #000 100%);

  border: 2px solid rgba(0,255,102,0.9);
  box-shadow:
    0 0 25px rgba(0,255,102,0.4),
    inset 0 0 50px rgba(0,0,0,0.6);
}

.hero img{
  width: 100%;
  height: 100%;
  display: block;

  object-fit: contain;        /* ✅ 不裁切，完整放進框內 */
  object-position: center 20%;/* 可微調上下位置（先用 20% 讓人往上） */

  padding: 18px;              /* ✅ 留白讓人物不貼框 */
  box-sizing: border-box;

  filter: contrast(1.05) saturate(1.05);
}
/* 內框線（HUD） */
.hero-inner::before{
  content:"";
  position:absolute;
  inset:0;
  background:
    repeating-linear-gradient(
      to bottom,
      rgba(0,0,0,0.2) 0px,
      rgba(0,0,0,0.2) 2px,
      transparent 2px,
      transparent 4px
    );
  mix-blend-mode: overlay;
  opacity: 0.4;
  pointer-events:none;
}



.hud-corners{
  position:absolute;
  inset:0;
  pointer-events:none;
}

.c{
  position:absolute;
  width: 32px;
  height: 32px;
  border: 3px solid #00FF66;
  box-shadow: 0 0 14px rgba(0,255,102,0.35);
}

.tl{ top:12px; left:12px; border-right:none; border-bottom:none; }
.tr{ top:12px; right:12px; border-left:none; border-bottom:none; }
.bl{ bottom:12px; left:12px; border-right:none; border-top:none; }
.br{ bottom:12px; right:12px; border-left:none; border-top:none; }

    .hud-corners{
      position:absolute;
      inset:0;
      pointer-events:none;
    }

    .c{
      position:absolute;
      width: 34px;
      height: 34px;
      border: 3px solid var(--eva-green);
      box-shadow: 0 0 14px rgba(0,255,102,0.35);
    }
    .tl{ top:10px; left:10px; border-right:none; border-bottom:none; }
    .tr{ top:10px; right:10px; border-left:none; border-bottom:none; }
    .bl{ bottom:10px; left:10px; border-right:none; border-top:none; }
    .br{ bottom:10px; right:10px; border-left:none; border-top:none; }

    /* 小字狀態 */
#status{
  display: none;        /* ✅ 預設不顯示 */
  min-height: 30px;
  font-size: 18px;
  opacity: 0.9;
  letter-spacing: 2px;
  text-align: center;
}

    /* 底部控制列 */
    #controls{
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: var(--ctrl-h);
      padding: 14px 16px calc(14px + env(safe-area-inset-bottom)) 16px;
      display: flex;
      gap: 12px;
      justify-content: center;
      align-items: center;
      background: rgba(0,0,0,0.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border-top: 2px solid rgba(0,255,102,0.35);
      z-index: 10;
    }

    #controls button{
      flex: 1;
      max-width: 520px;
      height: 76px;
      font-size: 34px;
      border-radius: 0;
      border: 2px solid var(--eva-green);
      background: transparent;
      color: var(--eva-green);
      cursor: pointer;
      letter-spacing: 6px;
      transition: all 0.2s ease;
    }

    #controls button:hover{
      background: var(--eva-green);
      color: #000;
      box-shadow: 0 0 20px var(--eva-green);
    }

    #controls button:disabled{
      opacity: 0.5;
      cursor: not-allowed;
      box-shadow: none;
    }

    /* 拍完後的預覽圖（合成 strip） */
    #preview{
      display: none;
      max-width: 92vw;
      width: 92vw;
      border: 2px solid var(--eva-green);
      box-shadow: 0 0 30px rgba(0,255,100,0.4);
      touch-action: pan-y;
        margin-bottom: 120px; /* ✅ 保證最後一張不被 controls 蓋 */

    }
  </style>
</head>

<body>
  <div id="main">
    <h1>龍・三十一年目の降臨</h1>
    <h2>世界は、再び燃え上がる。</h2>

    <!-- 你的照片 -->
<div class="hero" id="hero">
  <img src="/public/me.png" alt="me" />
  <div class="hud-corners">...</div>
</div>

    <div id="status"></div>

    <!-- 拍完後顯示合成條 -->
    <img id="preview" />
  </div>

  <div id="controls">
    <button id="start">起動</button>
    <button id="retake" style="display:none;">再臨</button>
    <button id="print" style="display:none;">儀式実行</button>
  </div>

  <script>
    const startBtn = document.getElementById("start");
    const retakeBtn = document.getElementById("retake");
    const printBtn = document.getElementById("print");
    const preview = document.getElementById("preview");
    const status = document.getElementById("status");
    const hero = document.getElementById("hero");

function showStatus(text) {
  status.style.display = "block";
  status.innerText = text;
}

function hideStatus() {
  status.style.display = "none";
  status.innerText = "";
}

function setMode(mode) {
  // 先統一解鎖，避免曾經 busy 後沒解開
  startBtn.disabled = false;
  retakeBtn.disabled = false;
  printBtn.disabled = false;

  if (mode === "ready") {
    startBtn.style.display = "inline-block";
    retakeBtn.style.display = "none";
    printBtn.style.display = "none";
  }

  if (mode === "preview") {
    startBtn.style.display = "none";
    retakeBtn.style.display = "inline-block";
    printBtn.style.display = "inline-block";
  }

  if (mode === "busy") {
    startBtn.disabled = true;
    retakeBtn.disabled = true;
    printBtn.disabled = true;
  }
}

    async function shoot() {
      setMode("busy");
      showStatus("覚醒儀式進行中...");
      preview.style.display = "none";

      const r = await fetch("/shoot");
      if (!r.ok) {
        showStatus(await r.text());
        setMode("ready");
        return;
      }

      const data = await r.json();

      hero.style.display = "none";

      preview.src = "/output/" + data.file + "?t=" + Date.now();
      preview.style.display = "block";
      showStatus("降臨完了");
      setMode("preview");
      preview.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    async function doPrint() {
      setMode("busy");
      showStatus("儀式実行中...");

      const r = await fetch("/print", { method: "POST" });
      if (!r.ok) {
        showStatus(await r.text());
        setMode("preview");
        return;
      }

      showStatus("儀式完了 ✔");

      setTimeout(() => {
        preview.style.display = "none";
        hero.style.display = "block";
        hideStatus();
        setMode("ready");
      }, 1200);
    }

    startBtn.onclick = shoot;
    retakeBtn.onclick = shoot;
    printBtn.onclick = doPrint;

    setMode("ready");
    hideStatus();
  </script>
</body>
</html>`);
});

// ---- Shoot: run capture.scpt, set lastPhotoFullPath, return filename for preview ----
app.get("/shoot", (req, res) => {
  if (busy) return res.status(429).send("Busy... Please wait");
  busy = true;

  execFile("osascript", [capture3Script], async (err, stdout, stderr) => {
    try {
      if (err) {
        busy = false;
        console.error("capture3 error:", stderr || err.message);
        return res.status(500).send(stderr || err.message);
      }

      const lines = (stdout || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (lines.length < 3) {
        busy = false;
        return res.status(500).send("capture3 returned < 3 paths");
      }

      const fullPaths = lines.slice(0, 3);

      // 合成一張
      const { outPath, outName } = await makeStripCollage(fullPaths);

      lastPrintPath = outPath; // 這次 Print 就印這張
      busy = false;

      // iPad 預覽用 /output/<file>
      res.json({ file: outName });
    } catch (e) {
      busy = false;
      console.error(e);
      res.status(500).send("Failed to compose collage");
    }
  });
});

// ---- Print: print last captured photo (server-side state) ----
app.post("/print", (req, res) => {
  if (busy) return res.status(429).send("Busy... Please wait");
  if (!lastPrintPath) return res.status(400).send("No collage yet");

  busy = true;

  execFile("osascript", [printScript, lastPrintPath], (err, stdout, stderr) => {
    busy = false;

    if (err) {
      console.error("print error:", stderr || err.message);
      return res.status(500).send(stderr || err.message);
    }

    const out = (stdout || "").toString().trim();

    // ✅ print.scpt 主動回 ERROR:
    if (out.startsWith("ERROR:")) {
      console.error("print script returned error:", out);
      return res.status(500).send(out);
    }

    res.send(out || "PRINT_QUEUED");
  });
});

async function makeStripCollage(fullPaths) {
  // 4x6 portrait @ ~300dpi
  const W = 1200;
  const H = 1800;

  const margin = 80; // 外框留白
  const gap = 40; // 三張之間間距

  const usableH = H - margin * 2 - gap * 2;
  const tileH = Math.floor(usableH / 3);
  const tileW = W - margin * 2;

  // 每張先做「填滿裁切」成同尺寸
  const tiles = await Promise.all(
    fullPaths.map((p) =>
      sharp(p)
        .rotate() // 讀 EXIF 自動轉正
        .resize(tileW, tileH, { fit: "cover" })
        .jpeg({ quality: 90 })
        .toBuffer(),
    ),
  );

  const y1 = margin;
  const y2 = margin + tileH + gap;
  const y3 = margin + (tileH + gap) * 2;

  const collage = sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: "#ffffff",
    },
  }).composite([
    { input: tiles[0], left: margin, top: y1 },
    { input: tiles[1], left: margin, top: y2 },
    { input: tiles[2], left: margin, top: y3 },
  ]);

  const outName = `collage_${Date.now()}.jpg`;
  const outPath = path.join(outputDir, outName);
  await collage.jpeg({ quality: 92 }).toFile(outPath);

  return { outPath, outName };
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});

//  ~ lpstat -o
//  ~ cancel -a Canon_SELPHY_CP1500
