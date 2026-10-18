import { describe, expect, it } from "vitest";
import { markdownToText } from "../src/lib/fulltext";

describe("markdownToText", () => {
  it("keeps article paragraphs and drops menus, images and links", () => {
    const md = `Title: Test\n\nURL Source: https://x.in/a\n\nMarkdown Content:\n* [Home](https://x.in)\n* [India](https://x.in/india)\n![photo](https://x.in/p.jpg)\n# Big headline\nThe Supreme Court on Monday asked the [Centre](https://x.in/c) to respond within four weeks to the petition.\n\nAdvertisement\n\nThe **bench** noted that air quality in Mumbai had worsened sharply this autumn, with AQI above 200.\nShare`;
    const t = markdownToText(md);
    expect(t).toBe("The Supreme Court on Monday asked the Centre to respond within four weeks to the petition.\n\nThe bench noted that air quality in Mumbai had worsened sharply this autumn, with AQI above 200.");
  });
});

describe("isArticleLine", () => {
  it("drops website menus, comment prompts and photo credits", async () => {
    const { cleanArticle } = await import("../src/lib/fulltext");
    const raw = [
      "About UsCode of Editorial ValuesNews ArchiveSitemapPrint SubscriptionDigital SubscriptionSubscribe to Newsletters",
      "To continue logging in, remove at least one device from the below list ${ ind + 1 } ${ device }Last active - ${ la } Comments have to be in English, and in full sentences.",
      "Updated - October 19, 2026 01:44 am IST - Tehran Image used for representational purpose only.",
      "The Reserve Bank of India kept the repo rate unchanged at 6.5% on Friday, citing easing inflation.",
    ].join("\n");
    expect(cleanArticle(raw)).toBe("The Reserve Bank of India kept the repo rate unchanged at 6.5% on Friday, citing easing inflation.");
  });
});
