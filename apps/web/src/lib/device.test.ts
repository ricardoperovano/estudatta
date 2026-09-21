import { describe, expect, it } from "vitest";
import {
  detectInstallEnv,
  detectInstallPlatform,
  iosSupportsWebPush,
  iosVersion,
  isIOS,
  isStandalone,
} from "./device";

const UA = {
  iphoneSafari17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneSafari26:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
  iphoneSafari15:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.7 Mobile/15E148 Safari/604.1",
  iphoneSafari163:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1",
  iphoneChrome17:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0.6367.88 Mobile/15E148 Safari/604.1",
  iphoneChrome15:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/110.0.5481.83 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/125.0 Mobile/15E148 Safari/605.1.15",
  iphoneEdge:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/124.0.2478.50 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidSamsung:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36",
  androidFirefox: "Mozilla/5.0 (Android 14; Mobile; rv:125.0) Gecko/125.0 Firefox/125.0",
  androidEdge:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 EdgA/124.0.2478.64",
  androidWebView:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
  winChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  winEdge:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.2478.67",
  linuxFirefox: "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
  macSafari17:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  macSafari16:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
  macChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};
const mac = { platform: "MacIntel", maxTouchPoints: 0 };
const ipad = { platform: "MacIntel", maxTouchPoints: 5 };
const phone = { platform: "iPhone", maxTouchPoints: 5 };

describe("isIOS / iosVersion", () => {
  it("reconhece iPhone e iPad em modo desktop, mas não Mac", () => {
    expect(isIOS(UA.iphoneSafari17, phone)).toBe(true);
    expect(isIOS(UA.ipadDesktop, ipad)).toBe(true);
    expect(isIOS(UA.macSafari17, mac)).toBe(false);
    expect(isIOS(UA.androidChrome, {})).toBe(false);
  });

  it("lê a versão do iOS, inclusive com o UA congelado do iOS 26", () => {
    expect(iosVersion(UA.iphoneSafari17, phone)).toBeCloseTo(17.05);
    expect(iosVersion(UA.iphoneSafari26, phone)).toBeCloseTo(26);
    expect(iosVersion(UA.iphoneChrome15, phone)).toBeCloseTo(15.06);
    expect(iosVersion(UA.ipadDesktop, ipad)).toBeCloseTo(17.04);
    expect(iosVersion(UA.androidChrome, {})).toBeNull();
  });

  it("push no iOS só a partir do 16.4", () => {
    expect(iosSupportsWebPush(UA.iphoneSafari17, phone)).toBe(true);
    expect(iosSupportsWebPush(UA.iphoneSafari163, phone)).toBe(false);
    expect(iosSupportsWebPush(UA.iphoneSafari15, phone)).toBe(false);
  });
});

describe("detectInstallPlatform", () => {
  it.each([
    ["iphoneSafari17", phone, "ios-safari"],
    ["iphoneSafari26", phone, "ios-safari"],
    ["iphoneSafari15", phone, "ios-safari"],
    ["iphoneChrome17", phone, "ios-other"],
    ["iphoneFirefox", phone, "ios-other"],
    ["iphoneEdge", phone, "ios-other"],
    ["iphoneChrome15", phone, "ios-other-legacy"],
    ["iphoneInstagram", phone, "in-app"],
    ["ipadDesktop", ipad, "ios-safari"],
    ["androidChrome", {}, "android-chrome"],
    ["androidSamsung", {}, "android-samsung"],
    ["androidFirefox", {}, "android-firefox"],
    ["androidEdge", {}, "android-other"],
    ["androidWebView", {}, "in-app"],
    ["winChrome", {}, "desktop-chromium"],
    ["winEdge", {}, "desktop-chromium"],
    ["macChrome", mac, "desktop-chromium"],
    ["macSafari17", mac, "desktop-safari"],
    ["macSafari16", mac, "desktop-other"],
    ["linuxFirefox", {}, "desktop-other"],
  ] as const)("%s → %s", (key, hints, expected) => {
    expect(detectInstallPlatform(UA[key], hints)).toBe(expected);
  });

  it("agrupa e informa navegador e push", () => {
    expect(detectInstallEnv(UA.iphoneChrome17, phone)).toMatchObject({
      group: "ios",
      mobile: true,
      browser: "Chrome",
      pushCapable: true,
    });
    expect(detectInstallEnv(UA.iphoneSafari15, phone)).toMatchObject({ group: "ios", pushCapable: false });
    expect(detectInstallEnv(UA.androidSamsung, {})).toMatchObject({
      group: "android",
      mobile: true,
      browser: "Samsung Internet",
      iosVersion: null,
    });
    expect(detectInstallEnv(UA.winEdge, {})).toMatchObject({
      group: "desktop",
      mobile: false,
      browser: "Edge",
    });
  });
});

describe("isStandalone", () => {
  const win = (standaloneMq: boolean, navStandalone?: boolean) =>
    ({
      matchMedia: (q: string) => ({ matches: standaloneMq && q.includes("standalone") }),
      navigator: { standalone: navStandalone },
    }) as unknown as Window;
  it("usa display-mode e navigator.standalone (iOS)", () => {
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
    expect(isStandalone(win(false))).toBe(false);
    expect(isStandalone(undefined)).toBe(false);
  });
});
