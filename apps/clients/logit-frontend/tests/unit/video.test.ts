import { describe, expect, it } from "vitest";
import { youtubeEmbedUrl } from "$lib/features/exercise/components/video";

describe("exercise videos (decision D3)", () => {
  it("plays YouTube links from youtube-nocookie.com, whatever form they're pasted in", () => {
    const want = "https://www.youtube-nocookie.com/embed/abcDEF12345?autoplay=1&rel=0";
    for (const url of ["https://www.youtube.com/watch?v=abcDEF12345", "https://youtu.be/abcDEF12345", "https://m.youtube.com/shorts/abcDEF12345", " https://youtube.com/embed/abcDEF12345 "]) {
      expect(youtubeEmbedUrl(url)).toBe(want);
    }
  });
  it("plays nothing else", () => {
    expect(youtubeEmbedUrl("https://example.com/watch?v=abcDEF12345")).toBeNull();
    expect(youtubeEmbedUrl("not a link")).toBeNull();
    expect(youtubeEmbedUrl("https://youtube.com/watch?v=<script>")).toBeNull();
  });
});
