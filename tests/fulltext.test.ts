import { describe, expect, it } from "vitest";
import { markdownToText } from "../src/lib/fulltext";

describe("markdownToText", () => {
  it("keeps article paragraphs and drops menus, images and links", () => {
    const md = `Title: Test\n\nURL Source: https://x.in/a\n\nMarkdown Content:\n* [Home](https://x.in)\n* [India](https://x.in/india)\n![photo](https://x.in/p.jpg)\n# Big headline\nThe Supreme Court on Monday asked the [Centre](https://x.in/c) to respond within four weeks to the petition.\n\nAdvertisement\n\nThe **bench** noted that air quality in Mumbai had worsened sharply this autumn, with AQI above 200.\nShare`;
    const t = markdownToText(md);
    expect(t).toBe("The Supreme Court on Monday asked the Centre to respond within four weeks to the petition.\n\nThe bench noted that air quality in Mumbai had worsened sharply this autumn, with AQI above 200.");
  });
});
