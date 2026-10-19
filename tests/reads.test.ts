import { describe, expect, it } from "vitest";
import { parseWotd } from "../scripts/fetch-reads";
import { stripHtml } from "../shared/rss";

const desc = `&lt;div class="mw-parser-output"&gt;&lt;style data-mw-deduplicate="TemplateStyles:r1"&gt;.mw-parser-output .mf-wotd&gt;.wotd-container{margin-top:-47px}&lt;/style&gt;&lt;div class="mf-wotd"&gt;&lt;span&gt;&lt;a href="/wiki/serendipity" title="serendipity"&gt;serendipity&lt;/a&gt;&lt;/span&gt; &lt;i&gt;n&lt;/i&gt; &lt;ol&gt;&lt;li&gt;A combination of events which have come together by chance to make a surprisingly good result.&lt;/li&gt;&lt;/ol&gt;&lt;/div&gt;&lt;/div&gt;`;
const xml = `<rss><channel><item><title>Wiktionary:Word of the day/2026/October 19</title><link>https://en.wiktionary.org/wiki/Wiktionary:Word_of_the_day/2026/October_19</link><description>${desc}</description><pubDate>Sun, 19 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>`;

describe("word of the day", () => {
  it("takes the word from its entry link and drops the embedded CSS", () => {
    const [w] = parseWotd(xml);
    expect(w.title).toBe("serendipity");
    expect(w.text).toMatch(/^n A combination of events/);
    expect(w.text).not.toMatch(/mw-parser|\{/);
  });
  it("never shows style code as text", () => {
    expect(stripHtml("<style>.a{b:c}</style><p>Hello</p>")).toBe("Hello");
  });
});
