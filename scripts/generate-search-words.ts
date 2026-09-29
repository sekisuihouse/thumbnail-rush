import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const japaneseNouns = ["家","電車","宇宙","祭り","庭","時計","カメラ","机","窓","橋","ロボット","自転車","電話","箱","帽子","雲","星","雨","雪","風","森","川","船","城","道路","映画","写真","手紙","地図","鍵","靴","鏡","花","石","光","音","朝","夜","春","夏","秋","冬"];
const japaneseMods = ["赤い","青い","大きな","小さな","古い","新しい","不思議な","静かな","速い","遅い","巨大な","透明な","最後の","最初の","秘密の","伝説の","普通の","突然の","世界一の","手作り"];
const englishNouns = ["house","train","space","festival","garden","clock","camera","desk","window","bridge","robot","bicycle","phone","box","hat","cloud","star","rain","snow","wind","forest","river","ship","castle","road","movie","photo","letter","map","key","shoes","mirror","flower","stone","light","sound","morning","night","spring","summer","autumn","winter"];
const englishMods = ["red","blue","big","tiny","old","new","strange","quiet","fast","slow","giant","invisible","last","first","secret","legendary","ordinary","sudden","world best","homemade"];

function expand(mods: string[], nouns: string[], language: "ja" | "en") {
  const words = new Set<string>();
  for (const mod of mods) for (const noun of nouns) {
    words.add(language === "ja" ? `${mod}${noun}` : `${mod} ${noun}`);
    for (let year = 1980; year <= 2026; year += 2) {
      words.add(language === "ja" ? `${year}年 ${noun}` : `${noun} ${year}`);
      words.add(language === "ja" ? `${year}年 ${mod}${noun}` : `${mod} ${noun} ${year}`);
    }
  }
  return [...words];
}

const ja = expand(japaneseMods, japaneseNouns, "ja");
const en = expand(englishMods, englishNouns, "en");
const output = { language: "mixed", categories: { generated_ja: ja, generated_en: en } };
const directory = join(process.cwd(), "data", "search-words");
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "expanded.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Generated ${ja.length + en.length} extensible search terms in data/search-words/expanded.json`);
