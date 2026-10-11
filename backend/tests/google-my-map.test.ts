/**
 * Larisa's Google map (googleMyMap.ts): her layers and pins from a My Maps KML, said to Scout with the link, her notes
 * and straight-line closeness — never a layer's date. Pure logic on a made-up map; no database, no network.
 */
import { describe, it, expect } from "vitest";
import { parseMyMapKml, myMapLines, viewLink, isMid, type MyMap } from "../src/services/guide/googleMyMap.js";

const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Test Trip</name>
<Folder><name>Old Town - Day 0</name>
<Placemark><name>Riverside Hotel</name><Point><coordinates>139.75790,35.67245,0</coordinates></Point></Placemark>
<Placemark><name>Noodle Shop</name><description><![CDATA[Cash only<br>Opens 11a]]></description><Point><coordinates>139.75869,35.66767,0</coordinates></Point></Placemark>
<Placemark><name>Noodle Shop</name><Point><coordinates>139.75869,35.66767,0</coordinates></Point></Placemark>
<Placemark><name>Walk</name><LineString><coordinates>139.7,35.6,0 139.8,35.7,0</coordinates></LineString></Placemark>
</Folder>
<Folder><name>Pottery Town</name>
<Placemark><name>Kiln Studio &amp; Gallery</name><Point><coordinates>136.84097,34.88690,0</coordinates></Point></Placemark>
</Folder></Document></kml>`;

describe("her Google map", () => {
  it("reads her layers by her names and their pins (lines left out, a pin twice said once)", () => {
    const m = parseMyMapKml(kml);
    expect(m.title).toBe("Test Trip");
    expect(m.layers.map((l) => l.name)).toEqual(["Old Town - Day 0", "Pottery Town"]);
    expect(m.layers[0].places.map((p) => p.name)).toEqual(["Riverside Hotel", "Noodle Shop"]);
    expect(m.layers[0].places[1]).toMatchObject({ note: "Cash only / Opens 11a", lat: 35.66767, lng: 139.75869 });
    expect(m.layers[1].places[0].name).toBe("Kiln Studio & Gallery");
  });

  it("tells Scout the link anyone can open, her notes, and closeness as a straight line — and that a layer isn't a date", () => {
    const parsed = parseMyMapKml(kml);
    const m: MyMap = { mid: "TestMapId_12345", title: parsed.title, layers: parsed.layers, readAt: "2030-01-11T03:00:00.000Z", hash: "x" };
    const lines = myMapLines(m).join("\n");
    expect(lines).toContain(viewLink("TestMapId_12345"));
    expect(lines).toContain("a layer's name is not a date");
    expect(lines).toContain('Layer "Old Town - Day 0":');
    expect(lines).toContain('Noodle Shop — her note: "Cash only / Opens 11a"');
    expect(lines).toMatch(/Riverside Hotel: Noodle Shop about \d+ m/);
    expect(lines).not.toMatch(/minute/);
  });

  it("only a map id that looks like one", () => {
    expect(isMid("aMadeUpMapId_0123456789xyz")).toBe(true);
    expect(isMid("https://evil/?x")).toBe(false);
    expect(isMid("")).toBe(false);
  });
});
