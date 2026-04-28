/**
 * documentAssets.ts
 *
 * Logo asset paths for use in document HTML previews.
 * In WebView, these are referenced as file:// URLs.
 */

import { Platform } from "react-native";

// Asset module IDs (from require statements)
const DAR_SQUARE_LOGO = require("@/assets/images/dar_square.png");
const BAGONG_PILIPINAS_LOGO = require("@/assets/images/bagong_pilipinas_logo.png");

/**
 * Get the file:// URL for an asset that can be used in WebView HTML.
 * Note: On iOS/Android, bundled assets need to be accessed via the
 * proper file protocol. This is a simplified approach.
 */
export function getAssetUrl(assetModule: any): string {
  if (Platform.OS === "web") {
    // For web, use the resolved path
    return assetModule;
  }

  // For native, try to construct a file URL
  // In production builds, assets are in the app bundle
  if (typeof assetModule === "number") {
    // Metro bundler returns numeric module IDs
    return `file:///android_asset/www/${assetModule}.png`;
  }

  return assetModule;
}

/**
 * HTML for DAR square logo (left side of letterhead)
 */
export function getDARLogoHTML(size: number = 55): string {
  return `<img src="${DAR_SQUARE_LOGO}" 
    width="${size}" 
    height="${size}" 
    style="display:block; margin:auto;"
    alt="DAR Logo" />`;
}

/**
 * HTML for Bagong Pilipinas logo (right side of letterhead)
 */
export function getBagongPilipinasLogoHTML(size: number = 55): string {
  return `<img src="${BAGONG_PILIPINAS_LOGO}" 
    width="${size}" 
    height="${size}" 
    style="display:block; margin:auto; border-radius:50%;"
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
