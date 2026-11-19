import fs from "fs";
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { paperSvg } from "./tex.mjs";
const src = fs.readFileSync("layout.js", "utf8");
const buildCard = new Function(src + "; return buildCard;")();
const u = (s) => "data:image/svg+xml;base64," + Buffer.from(s).toString("base64");
const PAPER = u(paperSvg("#F3F1EC", "#E3DED7", 0.22)), DARK = u(paperSvg("#1A1A1A", "#262422", 0.25));
async function loadFont(fam, w, text) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${fam}:wght@${w}&text=${encodeURIComponent(text)}`)).text();
  const m = css.match(/src:\s*url\(([^)]+)\)\s*format\('(opentype|truetype)'\)/);
  return await (await fetch(m[1])).arrayBuffer();
}
const cards = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
fs.mkdirSync("out", { recursive: true });
let i = 0;
for (const c of cards) {
  i++;
  const card = buildCard(new URLSearchParams(c), PAPER, DARK);
  const [a, b, f] = await Promise.all([loadFont("Noto+Sans+TC", 500, card.text), loadFont("Noto+Sans+TC", 900, card.text), loadFont("Forum", 400, card.latin)]);
  const svg = await satori(card.root, { width: card.W, height: card.H, fonts: [
    { name: "Noto Sans TC", data: a, weight: 500, style: "normal" }, { name: "Noto Sans TC", data: b, weight: 900, style: "normal" }, { name: "Forum", data: f, weight: 400, style: "normal" }] });
  fs.writeFileSync(`out/card-${i}.png`, new Resvg(svg).render().asPng());
}
console.log("ok", i);
