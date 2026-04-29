/**
 * documentAssets.ts
 *
 * Logo assets for use in document HTML previews.
 * Images are embedded as base64 data URIs for WebView compatibility.
 */

import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

// Asset module IDs (from require statements)
export const DAR_SQUARE_LOGO_MODULE = require("@/assets/images/dar_square.png");
export const BAGONG_PILIPINAS_LOGO_MODULE = require("@/assets/images/bagong_pilipinas_logo.png");

// Cache for base64 encoded images
let darLogoBase64: string | null = null;
let bagongPilipinasLogoBase64: string | null = null;

/**
 * Load an asset and convert to base64 data URI
 */
async function loadAssetAsBase64(module: any): Promise<string> {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    const base64 = await FileSystem.readAsStringAsync(asset.localUri || asset.uri, {
      encoding: "base64",
    });
    return `data:image/png;base64,${base64}`;
  } catch (e) {
    console.error("Failed to load asset as base64:", e);
    return "";
  }
}

/**
 * Preload logo images as base64 data URIs.
 * Call this before generating HTML that includes logos.
 */
export async function preloadLogos(): Promise<void> {
  if (!darLogoBase64) {
    darLogoBase64 = await loadAssetAsBase64(DAR_SQUARE_LOGO_MODULE);
  }
  if (!bagongPilipinasLogoBase64) {
    bagongPilipinasLogoBase64 = await loadAssetAsBase64(BAGONG_PILIPINAS_LOGO_MODULE);
  }
}

/**
 * Get cached DAR logo base64 data URI
 */
export function getDARLogoBase64(): string {
  return darLogoBase64 || "";
}

/**
 * Get cached Bagong Pilipinas logo base64 data URI
 */
export function getBagongPilipinasLogoBase64(): string {
  return bagongPilipinasLogoBase64 || "";
}

/**
 * HTML for DAR square logo (left side of letterhead)
 * Uses cached base64 data URI
 */
export function getDARLogoHTML(size: number = 55): string {
  const src = getDARLogoBase64();
  if (!src) {
    // Fallback placeholder
    return `<div style="width:${size}px;height:${size}px;border:2px solid #064E3B;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#064E3B;font-weight:bold;">DAR</div>`;
  }
  return `<img src="${src}" 
    width="${size}" 
    height="${size}" 
    style="display:block; margin:auto;"
    alt="DAR Logo" />`;
}

/**
 * HTML for Bagong Pilipinas logo (right side of letterhead)
 * Uses cached base64 data URI
 */
export function getBagongPilipinasLogoHTML(size: number = 55): string {
  const src = getBagongPilipinasLogoBase64();
  if (!src) {
    // Fallback placeholder
    return `<div style="width:${size}px;height:${size}px;border:2px solid #999;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#555;text-align:center;padding:2px;">BAGONG PILIPINAS</div>`;
  }
  return `<img src="${src}" 
    width="${size}" 
    height="${size}" 
    style="display:block; margin:auto;"
    alt="Bagong Pilipinas" />`;
}

/**
 * Full DAR letterhead header HTML matching the official format.
 */
export function buildDARLetterheadHTML(
  provincialOffice: string = "DARPO-CAMARINES SUR I"
): string {
  return `
<!-- ── Letterhead ──────────────────────────────────────────────────── -->
<table style="margin-bottom: 6px; width:100%;">
  <colgroup>
    <col style="width: 18%"/>
    <col style="width: 64%"/>
    <col style="width: 18%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="vertical-align: middle; text-align: center; padding:4px;">
        ${getDARLogoHTML(60)}
      </td>
      <td style="text-align: center; vertical-align: middle; padding:4px;">
        <div style="font-size: 8.5pt; line-height: 1.4; margin-bottom:2px;">
          REPUBLIC OF THE PHILIPPINES
        </div>
        <div style="font-size: 13pt; font-weight: bold; line-height: 1.3;">
          DEPARTMENT OF AGRARIAN REFORM
        </div>
        <div style="font-size: 8pt; font-style: italic; line-height: 1.3; color:#555;">
          Tunay na Pagbabago sa Repormang Agraryo
        </div>
        <div style="font-size: 9pt; font-weight: bold; margin-top: 4px; color:#064E3B;">
          ${provincialOffice}
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center; padding:4px;">
        ${getBagongPilipinasLogoHTML(60)}
      </td>
    </tr>
  </tbody>
</table>

<hr style="border: none; border-top: 2px solid #000; margin: 6px 0 10px 0;"/>
`;
}

/**
 * Simple document title style (for Appendix forms like IAR, DV, ORS)
 */
export function buildFormHeaderHTML(
  title: string,
  appendix: string,
  subtitle?: string
): string {
  return `
<div style="text-align: center; margin-bottom: 12px;">
  <div style="font-size: 11pt; font-weight: bold; margin-bottom: 2px;">
    ${title}
  </div>
  <div style="font-size: 9pt; font-style: italic; color: #555;">
    ${appendix}
  </div>
  ${subtitle ? `<div style="font-size: 9pt; margin-top: 4px;">${subtitle}</div>` : ""}
</div>
`;
}
