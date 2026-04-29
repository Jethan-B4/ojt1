/**
 * documentAssets.ts
 *
 * Logo assets for use in document HTML previews.
 * Images are referenced directly via their asset URIs (no base64).
 */

import { Asset } from "expo-asset";

// Asset module IDs (from require statements)
export const DAR_SQUARE2_LOGO_MODULE = require("@/assets/images/dar_square2.png");
export const BAGONG_PILIPINAS_LOGO_MODULE = require("@/assets/images/bagong_pilipinas.png");
export const ISO_CERTIFIED_LOGO_MODULE = require("@/assets/images/iso_certified.png");

// Cache for resolved URIs
let darSquare2LogoUri: string | null = null;
let bagongPilipinasLogoUri: string | null = null;
let isoCertifiedLogoUri: string | null = null;

/**
 * Load an asset and resolve a usable URI (prefer localUri if available).
 */
async function loadAssetUri(module: any): Promise<string> {
  try {
    const asset = Asset.fromModule(module);
    await asset.downloadAsync();
    return asset.localUri || asset.uri || "";
  } catch (e) {
    console.error("Failed to load asset uri:", e);
    return "";
  }
}

/**
 * Preload logo images as URIs.
 * Call this before generating HTML that includes logos.
 */
export async function preloadLogos(): Promise<void> {
  if (!darSquare2LogoUri) {
    darSquare2LogoUri = await loadAssetUri(DAR_SQUARE2_LOGO_MODULE);
  }
  if (!bagongPilipinasLogoUri) {
    bagongPilipinasLogoUri = await loadAssetUri(BAGONG_PILIPINAS_LOGO_MODULE);
  }
  if (!isoCertifiedLogoUri) {
    isoCertifiedLogoUri = await loadAssetUri(ISO_CERTIFIED_LOGO_MODULE);
  }
}

function imgHtml(src: string, size: number, alt: string): string {
  if (!src) return "";
  return `<img src="${src}"
    width="${size}"
    height="${size}"
    style="display:block; margin:auto;"
    alt="${alt}" />`;
}

/**
 * HTML for DAR Square2 logo (DAR logo)
 * Uses cached URI
 */
export function getDARSquare2LogoHTML(size: number = 55): string {
  const src = darSquare2LogoUri || "";
  if (!src)
    return `<div style="width:${size}px;height:${size}px;border:2px solid #064E3B;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:8pt;color:#064E3B;font-weight:bold;">DAR</div>`;
  return imgHtml(src, size, "DAR Logo");
}

/**
 * HTML for Bagong Pilipinas logo (right side of letterhead)
 * Uses cached URI
 */
export function getBagongPilipinasLogoHTML(size: number = 55): string {
  const src = bagongPilipinasLogoUri || "";
  if (!src)
    return `<div style="width:${size}px;height:${size}px;border:2px solid #999;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7pt;color:#555;text-align:center;padding:2px;">BAGONG PILIPINAS</div>`;
  return imgHtml(src, size, "Bagong Pilipinas");
}

/**
 * HTML for ISO Certified logo (certification badge)
 * Uses cached URI
 */
export function getISOCertifiedLogoHTML(size: number = 40): string {
  const src = isoCertifiedLogoUri || "";
  if (!src) {
    // Fallback placeholder
    return `<div style="width:${size}px;height:${size}px;border:1px solid #0066cc;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:6pt;color:#0066cc;text-align:center;">ISO</div>`;
  }
  return imgHtml(src, size, "ISO Certified");
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
        ${getDARSquare2LogoHTML(60)}
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
 * RFQ/Canvass letterhead header HTML with logos and certification badge
 */
export function buildRFQLetterheadHTML(
  provincialOffice: string = "DEPARTMENT OF AGRARIAN REFORM"
): string {
  return `
<!-- ── RFQ/Canvass Letterhead ─────────────────────────────────────────── -->
<table style="margin-bottom: 8px; width:100%;">
  <colgroup>
    <col style="width: 15%"/>
    <col style="width: 70%"/>
    <col style="width: 15%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="vertical-align: middle; text-align: center; padding:6px;">
        ${getDARSquare2LogoHTML(50)}
      </td>
      <td style="text-align: center; vertical-align: middle; padding:4px;">
        <div style="font-size: 9pt; line-height: 1.3; margin-bottom:2px; font-weight: bold;">
          REPUBLIC OF THE PHILIPPINES
        </div>
        <div style="font-size: 12pt; font-weight: bold; line-height: 1.2; color: #064E3B;">
          ${provincialOffice}
        </div>
        <div style="font-size: 8pt; line-height: 1.3; color: #555; margin-top:2px;">
          REGIONAL OFFICE NO. V
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center; padding:6px;">
        ${getBagongPilipinasLogoHTML(50)}
      </td>
    </tr>
  </tbody>
</table>

<table style="margin-bottom: 12px; width:100%;">
  <colgroup>
    <col style="width: 85%"/>
    <col style="width: 15%"/>
  </colgroup>
  <tbody>
    <tr>
      <td style="text-align: center; vertical-align: middle; padding:4px;">
        <div style="font-size: 14pt; font-weight: bold; letter-spacing: 0.5px;">
          REQUEST FOR QUOTATION
        </div>
      </td>
      <td style="vertical-align: middle; text-align: center; padding:4px;">
        ${getISOCertifiedLogoHTML(35)}
      </td>
    </tr>
  </tbody>
</table>

<hr style="border: none; border-top: 1.5px solid #000; margin: 8px 0 12px 0;"/>
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
