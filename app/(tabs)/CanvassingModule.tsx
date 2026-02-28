import { useEffect, useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type CanvassStage =
  | "pr_received"      // Step 6 – BAC receives approved PR
  | "bac_resolution"   // Step 7 – Prepare & route BAC Resolution
  | "release_canvass"  // Step 8 – Release canvass sheets to canvassers
  | "collect_canvass"  // Step 9 – Receive filled-out canvass
  | "aaa_preparation"; // Step 10 – Prepare Abstract of Awards

interface PRItem {
  id: number;
  desc: string;
  stock: string;
  unit: string;
  qty: number;
  unitCost: number;
}

interface PurchaseRequest {
  prNo: string;
  date: string;
  officeSection: string;
  responsibilityCode: string;
  purpose: string;
  items: PRItem[];
  isHighValue: boolean;
  budgetNumber?: string;
  papCode?: string;
}

interface SupplierQuote {
  id: number;
  supplierName: string;
  address: string;
  contactNo: string;
  tinNo: string;
  deliveryDays: string;
  unitPrices: Record<number, string>; // itemId → price
  remarks: string;
}

interface BACMember {
  name: string;
  designation: string;
  signed: boolean;
  signedAt: string;
}

interface CanvassEntry {
  itemId: number;
  divisionSection: string;
  canvasserName: string;
  releaseDate: string;
  returnDate: string;
  status: "pending" | "released" | "returned";
  quotes: SupplierQuote[];
}

// ─── Mock PR Data (simulating what came from the PR form) ────────────────────

const MOCK_PR: PurchaseRequest = {
  prNo: "2026-PR-0042",
  date: "February 26, 2026",
  officeSection: "STOD",
  responsibilityCode: "10-001",
  purpose: "Procurement of office supplies for Q1 operations and administrative needs of the division.",
  isHighValue: false,
  items: [
    { id: 1, desc: "Bond Paper, Short (70gsm)", stock: "SP-001", unit: "ream", qty: 10, unitCost: 220 },
    { id: 2, desc: "Ballpen, Black (0.5mm)", stock: "SP-002", unit: "box", qty: 5, unitCost: 85 },
    { id: 3, desc: "Stapler, Heavy Duty", stock: "SP-003", unit: "pc", qty: 2, unitCost: 350 },
    { id: 4, desc: "Correction Tape", stock: "SP-004", unit: "pc", qty: 12, unitCost: 45 },
  ],
};

const SECTIONS = ["STOD", "LTSP", "ARBDSP", "Legal", "PARPO", "PARAD", "TDG Unit", "Budget", "Accounting"];

const TODAY_STR = new Date().toLocaleDateString("en-PH", {
  year: "numeric", month: "long", day: "numeric",
});

const STAGE_META: Record<CanvassStage, { step: number; label: string; icon: string; desc: string }> = {
  pr_received:     { step: 6,  label: "PR Received",       icon: "📥", desc: "PR received from PARPO's Office for preparation of canvass & resolution" },
  bac_resolution:  { step: 7,  label: "BAC Resolution",    icon: "📋", desc: "Prepare BAC Resolution and release to BAC members and PARPO II for signature" },
  release_canvass: { step: 8,  label: "Release Canvass",   icon: "📤", desc: "Release canvass sheets to designated canvassers per division" },
  collect_canvass: { step: 9,  label: "Collect Canvass",   icon: "📊", desc: "Receive filled-out canvass forms from canvassers (within 7 days)" },
  aaa_preparation: { step: 10, label: "Prepare AAA",       icon: "🏆", desc: "Prepare Abstract of Awards and release to BAC members and PARPO II for signature" },
};

const STAGE_ORDER: CanvassStage[] = [
  "pr_received", "bac_resolution", "release_canvass", "collect_canvass", "aaa_preparation"
];

// ─── CSS ──────────────────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=DM+Mono:wght@400;500&family=Playfair+Display:wght@600;700&display=swap');

.cv-root *, .cv-root *::before, .cv-root *::after { box-sizing: border-box; margin: 0; padding: 0; }

.cv-root {
  --gd: #1a4d2e; --gm: #2d6a4f; --ga: #52b788; --gl: #d8f3dc; --gll: #edfbf2;
  --gold: #c9a84c; --gold-d: #7a5000; --gold-l: #fdf5e0;
  --red: #c0392b; --red-l: #fdecea;
  --blue: #2563eb; --blue-l: #eff6ff;
  --txt: #1c1c1e; --muted: #6b7280; --muted2: #9ca3af;
  --border: #e5e7eb; --border2: #d1d5db;
  --bg: #f8faf8; --bg2: #f1f5f1; --white: #ffffff;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
  --shadow: 0 4px 16px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.05);
  --shadow-lg: 0 12px 40px rgba(0,0,0,.12), 0 4px 12px rgba(0,0,0,.08);
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  min-height: 100vh;
  color: var(--txt);
}

/* ── Layout ── */
.cv-layout { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }

/* ── Sidebar ── */
.cv-sidebar {
  background: var(--gd);
  display: flex; flex-direction: column;
  padding: 0;
  position: sticky; top: 0; height: 100vh; overflow-y: auto;
}
.cv-sidebar::-webkit-scrollbar { width: 4px; }
.cv-sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius:2px; }

.cv-sidebar-top {
  padding: 24px 20px 20px;
  border-bottom: 1px solid rgba(255,255,255,.08);
}
.cv-sidebar-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
.cv-sidebar-emblem {
  width: 38px; height: 38px; border-radius: 10px;
  background: rgba(255,255,255,.12);
  display: flex; align-items: center; justify-content: center; font-size: 20px;
}
.cv-sidebar-brand { color: #fff; }
.cv-sidebar-org { font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; opacity: .5; }
.cv-sidebar-title { font-size: 14px; font-weight: 700; }
.cv-sidebar-module {
  background: rgba(255,255,255,.08); border-radius: 8px;
  padding: 8px 12px; display: flex; align-items: center; gap: 8px;
}
.cv-sidebar-module-label { font-size: 10px; letter-spacing:.08em; text-transform:uppercase; opacity:.5; color:#fff; display:block; margin-bottom:2px; }
.cv-sidebar-module-name { font-size: 13px; font-weight: 600; color: var(--ga); }

/* PR Card in sidebar */
.cv-pr-card {
  margin: 16px 20px;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px; padding: 14px;
}
.cv-pr-card-label { font-size: 9.5px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.4); margin-bottom: 8px; }
.cv-pr-no { font-family: 'DM Mono', monospace; font-size: 15px; font-weight: 500; color: #fff; margin-bottom: 4px; }
.cv-pr-section { font-size: 11.5px; color: var(--ga); font-weight: 600; margin-bottom: 10px; }
.cv-pr-items { display: flex; flex-direction: column; gap: 4px; }
.cv-pr-item { font-size: 11px; color: rgba(255,255,255,.6); display: flex; justify-content: space-between; }
.cv-pr-item-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px; }
.cv-pr-item-cost { font-family: 'DM Mono', monospace; color: rgba(255,255,255,.4); flex-shrink: 0; }
.cv-pr-total {
  margin-top: 10px; padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,.1);
  display: flex; justify-content: space-between; align-items: center;
}
.cv-pr-total-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: rgba(255,255,255,.4); font-weight: 600; }
.cv-pr-total-val { font-family: 'DM Mono', monospace; font-size: 14px; color: var(--ga); font-weight: 500; }

/* Sidebar nav */
.cv-nav { padding: 8px 12px; flex: 1; }
.cv-nav-section-label { font-size: 9px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: rgba(255,255,255,.3); padding: 12px 8px 6px; }
.cv-nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: 8px; cursor: pointer;
  transition: all .2s; margin-bottom: 2px; position: relative;
}
.cv-nav-item:hover { background: rgba(255,255,255,.06); }
.cv-nav-item.active { background: rgba(82,183,136,.18); }
.cv-nav-icon { font-size: 15px; flex-shrink: 0; opacity: .7; }
.cv-nav-item.active .cv-nav-icon { opacity: 1; }
.cv-nav-text { flex: 1; }
.cv-nav-step { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.35); font-weight: 600; }
.cv-nav-item.active .cv-nav-step { color: var(--ga); }
.cv-nav-name { font-size: 12.5px; color: rgba(255,255,255,.6); font-weight: 500; }
.cv-nav-item.active .cv-nav-name { color: #fff; font-weight: 600; }
.cv-nav-item.done .cv-nav-name { color: rgba(255,255,255,.4); }
.cv-nav-check { font-size: 12px; color: var(--ga); flex-shrink: 0; }
.cv-nav-connector {
  position: absolute; left: 22px; bottom: -10px;
  width: 1px; height: 10px; background: rgba(255,255,255,.08);
  pointer-events: none;
}

/* Phase badge in sidebar */
.cv-phase-badge {
  margin: 0 20px 20px;
  background: rgba(82,183,136,.1);
  border: 1px solid rgba(82,183,136,.2);
  border-radius: 8px; padding: 10px 14px;
  display: flex; align-items: center; gap: 10px;
}
.cv-phase-icon { font-size: 18px; }
.cv-phase-label { font-size: 9px; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.4); }
.cv-phase-name { font-size: 12px; font-weight: 600; color: var(--ga); }

/* ── Main ── */
.cv-main { display: flex; flex-direction: column; min-height: 100vh; }

/* Top bar */
.cv-topbar {
  background: var(--white);
  border-bottom: 1px solid var(--border);
  padding: 16px 32px;
  display: flex; align-items: center; justify-content: space-between;
  position: sticky; top: 0; z-index: 10;
  box-shadow: var(--shadow-sm);
}
.cv-topbar-left { display: flex; align-items: center; gap: 12px; }
.cv-breadcrumb { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
.cv-breadcrumb-sep { color: var(--border2); }
.cv-breadcrumb-active { color: var(--txt); font-weight: 600; }
.cv-stage-pill {
  padding: 4px 12px; border-radius: 20px;
  font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
}
.cv-stage-pill.canvass { background: var(--gl); color: var(--gm); }
.cv-topbar-right { display: flex; align-items: center; gap: 10px; }
.cv-deadline-chip {
  background: var(--gold-l); border: 1px solid var(--gold);
  border-radius: 6px; padding: 5px 12px;
  font-size: 11.5px; font-weight: 600; color: var(--gold-d);
  display: flex; align-items: center; gap: 6px;
}

/* ── Content ── */
.cv-content { flex: 1; padding: 32px; max-width: 960px; width: 100%; }

/* Step header */
.cv-step-header {
  margin-bottom: 24px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
  flex-wrap: wrap;
}
.cv-step-header-left {}
.cv-step-eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--ga); margin-bottom: 4px; }
.cv-step-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 700; color: var(--gd); line-height: 1.2; margin-bottom: 6px; }
.cv-step-desc { font-size: 13.5px; color: var(--muted); line-height: 1.6; max-width: 560px; }
.cv-step-badge {
  flex-shrink: 0;
  background: var(--gd); color: #fff;
  border-radius: 12px; padding: 10px 18px; text-align: center;
}
.cv-step-badge-num { font-family: 'DM Mono', monospace; font-size: 28px; font-weight: 500; line-height: 1; }
.cv-step-badge-label { font-size: 9px; letter-spacing: .1em; text-transform: uppercase; opacity: .6; margin-top: 2px; }

/* Cards */
.cv-card {
  background: var(--white); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px 24px;
  box-shadow: var(--shadow-sm); margin-bottom: 16px;
}
.cv-card-title {
  font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 14px;
  display: flex; align-items: center; gap: 8px;
}
.cv-card-title::after { content:''; flex:1; height:1px; background:var(--border); }
.cv-card-title span.tag {
  background: var(--gl); color: var(--gm);
  border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 700;
}

/* Info grid */
.cv-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.cv-info-item { display: flex; flex-direction: column; gap: 3px; }
.cv-info-label { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted2); }
.cv-info-val { font-size: 13.5px; color: var(--txt); font-weight: 500; }
.cv-info-val.mono { font-family: 'DM Mono', monospace; font-size: 13px; }

/* Fields */
.cv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.cv-grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
.cv-field { display: flex; flex-direction: column; gap: 5px; }
.cv-label { font-size: 12px; font-weight: 600; color: var(--txt); display: flex; align-items: center; gap: 4px; }
.cv-req { color: var(--red); }
.cv-hint { font-size: 10.5px; color: var(--muted); font-weight: 400; margin-left: 4px; }
.cv-input, .cv-select, .cv-textarea {
  width: 100%; padding: 9px 13px;
  border: 1.5px solid var(--border2); border-radius: 8px;
  font-family: 'DM Sans', sans-serif; font-size: 13.5px; color: var(--txt);
  background: var(--white); outline: none; appearance: none;
  transition: border-color .2s, box-shadow .2s;
}
.cv-input:focus, .cv-select:focus, .cv-textarea:focus {
  border-color: var(--ga); box-shadow: 0 0 0 3px rgba(82,183,136,.15);
}
.cv-input.ro { background: var(--bg2); color: var(--muted); font-family: 'DM Mono', monospace; font-size: 12px; cursor: not-allowed; }
.cv-select { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14 2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; padding-right: 32px; }
.cv-textarea { resize: vertical; min-height: 72px; }

/* Canvass sheet table */
.cv-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.cv-table th {
  background: var(--gd); color: #fff;
  padding: 9px 12px; text-align: left;
  font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
}
.cv-table th:first-child { border-radius: 8px 0 0 0; }
.cv-table th:last-child  { border-radius: 0 8px 0 0; }
.cv-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
.cv-table tr:last-child td { border-bottom: none; }
.cv-table tr:hover td { background: var(--bg); }
.cv-table .mono { font-family: 'DM Mono', monospace; font-size: 12.5px; }

/* Supplier quote inputs */
.cv-quote-input {
  width: 100%; border: 1.5px solid var(--border2); border-radius: 6px;
  padding: 6px 10px; font-family: 'DM Mono', monospace; font-size: 13px;
  color: var(--txt); background: var(--white); outline: none;
  transition: border-color .2s;
}
.cv-quote-input:focus { border-color: var(--ga); }
.cv-quote-winner { background: var(--gll); border-color: var(--ga); color: var(--gm); font-weight: 600; }

/* Supplier block */
.cv-supplier-block {
  border: 1.5px solid var(--border2); border-radius: 10px;
  overflow: hidden; margin-bottom: 12px;
  transition: border-color .2s;
}
.cv-supplier-block.winner { border-color: var(--ga); }
.cv-supplier-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; background: var(--bg2);
  border-bottom: 1px solid var(--border);
}
.cv-supplier-header.winner-hdr { background: var(--gll); }
.cv-supplier-name-row { display: flex; align-items: center; gap: 8px; }
.cv-supplier-num {
  width: 24px; height: 24px; border-radius: 6px;
  background: var(--gd); color: #fff;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.cv-supplier-num.winner-num { background: var(--ga); }
.cv-supplier-title { font-size: 13.5px; font-weight: 600; color: var(--txt); }
.cv-winner-chip {
  display: flex; align-items: center; gap: 4px;
  background: var(--ga); color: var(--gd);
  border-radius: 20px; padding: 3px 10px;
  font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
}
.cv-supplier-body { padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
.cv-supplier-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
.cv-supplier-del-btn {
  background: none; border: 1.5px solid var(--border2); border-radius: 6px;
  padding: 6px 12px; cursor: pointer; color: var(--muted);
  font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
  transition: all .2s; display: flex; align-items: center; gap: 4px;
}
.cv-supplier-del-btn:hover { border-color: var(--red); color: var(--red); background: var(--red-l); }
.cv-add-supplier-btn {
  width: 100%; padding: 10px;
  border: 2px dashed var(--border2); border-radius: 10px;
  background: none; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
  color: var(--muted); display: flex; align-items: center; justify-content: center; gap: 6px;
  transition: all .2s;
}
.cv-add-supplier-btn:hover { border-color: var(--ga); color: var(--gm); background: var(--gll); }

/* BAC members */
.cv-bac-members { display: flex; flex-direction: column; gap: 10px; }
.cv-bac-member {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-radius: 10px;
  border: 1.5px solid var(--border2);
  transition: all .2s;
}
.cv-bac-member.signed { border-color: var(--ga); background: var(--gll); }
.cv-bac-member-info { display: flex; align-items: center; gap: 12px; }
.cv-bac-avatar {
  width: 36px; height: 36px; border-radius: 8px;
  background: var(--bg2); border: 1.5px solid var(--border2);
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; color: var(--muted); flex-shrink: 0;
}
.cv-bac-member.signed .cv-bac-avatar { background: var(--ga); color: #fff; border-color: var(--ga); }
.cv-bac-name { font-size: 13.5px; font-weight: 600; color: var(--txt); }
.cv-bac-role { font-size: 11.5px; color: var(--muted); }
.cv-bac-member.signed .cv-bac-name { color: var(--gm); }
.cv-sign-btn {
  padding: 7px 16px; border-radius: 7px; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 12.5px; font-weight: 600;
  border: 1.5px solid var(--border2); background: var(--white); color: var(--muted);
  transition: all .2s;
}
.cv-sign-btn:hover { border-color: var(--ga); color: var(--gm); background: var(--gll); }
.cv-signed-tag {
  display: flex; align-items: center; gap: 5px;
  font-size: 12px; font-weight: 600; color: var(--gm);
}
.cv-signed-time { font-size: 10.5px; color: var(--muted); font-weight: 400; }

/* Canvassers per division */
.cv-div-rows { display: flex; flex-direction: column; gap: 8px; }
.cv-div-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-radius: 8px;
  border: 1.5px solid var(--border2);
  transition: all .2s;
}
.cv-div-row.released { border-color: var(--ga); background: var(--gll); }
.cv-div-row.overdue { border-color: var(--red); background: var(--red-l); }
.cv-div-section { font-size: 12px; font-weight: 700; color: var(--gd); width: 90px; flex-shrink: 0; }
.cv-div-canvasser { font-size: 13px; color: var(--txt); flex: 1; }
.cv-div-date { font-family: 'DM Mono', monospace; font-size: 11.5px; color: var(--muted); width: 110px; flex-shrink: 0; }
.cv-div-status {
  padding: 3px 10px; border-radius: 20px;
  font-size: 10.5px; font-weight: 700; letter-spacing:.04em;
  flex-shrink: 0; width: 80px; text-align: center;
}
.cv-div-status.pending  { background: #fef9c3; color: #854d0e; }
.cv-div-status.released { background: var(--gl); color: var(--gm); }
.cv-div-status.returned { background: #dbeafe; color: #1d4ed8; }
.cv-div-action { flex-shrink: 0; }
.cv-action-btn {
  padding: 5px 12px; border-radius: 6px; cursor: pointer;
  font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600;
  border: none; transition: all .2s;
}
.cv-action-btn.release { background: var(--ga); color: #fff; }
.cv-action-btn.receive { background: var(--blue); color: #fff; }
.cv-action-btn.release:hover { background: var(--gm); }
.cv-action-btn.receive:hover { background: #1d4ed8; }
.cv-action-btn:disabled { opacity: .4; cursor: not-allowed; }

/* Progress ring */
.cv-progress-row {
  display: flex; align-items: center; gap: 16px;
  padding: 16px; background: var(--bg2); border-radius: 10px;
  margin-bottom: 16px;
}
.cv-progress-bar-wrap { flex: 1; }
.cv-progress-label { font-size: 11px; font-weight: 600; color: var(--muted); margin-bottom: 6px; display: flex; justify-content: space-between; }
.cv-progress-bar { height: 8px; background: var(--border); border-radius: 4px; overflow: hidden; }
.cv-progress-fill { height: 100%; background: var(--ga); border-radius: 4px; transition: width .4s ease; }
.cv-progress-stat { text-align: center; }
.cv-progress-num { font-family: 'DM Mono', monospace; font-size: 22px; font-weight: 500; color: var(--gd); line-height: 1; }
.cv-progress-sublabel { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; font-weight: 600; }

/* Alert banners */
.cv-alert { border-radius: 8px; padding: 12px 14px; font-size: 13px; display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; }
.cv-alert.info    { background: var(--gll); border-left: 4px solid var(--ga); }
.cv-alert.warning { background: var(--gold-l); border-left: 4px solid var(--gold); }
.cv-alert.danger  { background: var(--red-l); border-left: 4px solid var(--red); }
.cv-alert-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.cv-alert-text { line-height: 1.5; color: var(--txt); }

/* AAA table */
.cv-aaa-wrap { overflow-x: auto; border-radius: 8px; border: 1px solid var(--border); }
.cv-aaa-table { width: 100%; border-collapse: collapse; font-size: 12.5px; white-space: nowrap; }
.cv-aaa-table th { background: var(--gd); color: #fff; padding: 8px 12px; text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
.cv-aaa-table td { padding: 9px 12px; border-bottom: 1px solid var(--border); }
.cv-aaa-table tr.winner-row td { background: var(--gll); font-weight: 600; color: var(--gm); }
.cv-aaa-table td.mono { font-family: 'DM Mono', monospace; }
.cv-aaa-table td.lowest { color: var(--gm); font-weight: 700; }

/* Next phase teaser */
.cv-next-phase {
  margin-top: 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, var(--gd) 0%, var(--gm) 100%);
  padding: 20px 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; flex-wrap: wrap;
}
.cv-next-phase-left {}
.cv-next-phase-eyebrow { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--ga); font-weight: 700; margin-bottom: 4px; }
.cv-next-phase-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; }
.cv-next-phase-sub { font-size: 12.5px; color: rgba(255,255,255,.6); }
.cv-next-phase-btn {
  background: var(--ga); color: var(--gd);
  border: none; border-radius: 8px; padding: 11px 22px;
  font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all .2s; white-space: nowrap;
}
.cv-next-phase-btn:hover { background: #fff; }

/* Footer nav */
.cv-footer-nav {
  padding: 20px 32px;
  border-top: 1px solid var(--border);
  background: var(--white);
  display: flex; justify-content: space-between; align-items: center;
  gap: 12px;
}
.cv-btn {
  padding: 10px 22px; border-radius: 8px;
  font-family: 'DM Sans', sans-serif; font-size: 14px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s;
}
.cv-btn.ghost { background: none; color: var(--muted); border: 1.5px solid var(--border2); }
.cv-btn.ghost:hover { background: var(--bg); color: var(--txt); }
.cv-btn.primary { background: var(--gd); color: #fff; }
.cv-btn.primary:hover { background: var(--gm); transform: translateY(-1px); box-shadow: 0 4px 12px rgba(26,77,46,.25); }
.cv-btn.primary:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
.cv-btn.gold { background: var(--gold-d); color: #fff; }
.cv-btn.gold:hover { background: #5c3c00; }

/* Responsive */
@media (max-width: 768px) {
  .cv-layout { grid-template-columns: 1fr; }
  .cv-sidebar { height: auto; position: static; }
  .cv-content { padding: 20px 16px; }
  .cv-info-grid, .cv-grid3 { grid-template-columns: 1fr 1fr; }
  .cv-supplier-meta { grid-template-columns: 1fr 1fr; }
}

/* Fade-in animation */
@keyframes cv-fadein { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
.cv-fadein { animation: cv-fadein .3s ease both; }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prTotal = MOCK_PR.items.reduce((s, i) => s + i.qty * i.unitCost, 0);

function initCanvassers(): CanvassEntry[] {
  return SECTIONS.slice(0, 6).map((sec, idx) => ({
    itemId: idx,
    divisionSection: sec,
    canvasserName: ["Yvonne M.", "Mariel T.", "Robert A.", "Angel D.", "Nessie P.", "Viviene S."][idx],
    releaseDate: "",
    returnDate: "",
    status: "pending" as const,
    quotes: [],
  }));
}

function initBACMembers(): BACMember[] {
  return [
    { name: "Yvonne M.", designation: "BAC Chairperson", signed: false, signedAt: "" },
    { name: "Mariel T.",  designation: "BAC Member",      signed: false, signedAt: "" },
    { name: "Robert A.",  designation: "BAC Member",      signed: false, signedAt: "" },
    { name: "PARPO II",   designation: "PARPO / Approver", signed: false, signedAt: "" },
  ];
}

function initSuppliers(): SupplierQuote[] {
  return [
    {
      id: 1, supplierName: "", address: "", contactNo: "", tinNo: "",
      deliveryDays: "", unitPrices: {}, remarks: "",
    },
  ];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PRSidebar({
  pr, currentStage, completedStages, onNavigate,
}: {
  pr: PurchaseRequest;
  currentStage: CanvassStage;
  completedStages: Set<CanvassStage>;
  onNavigate: (s: CanvassStage) => void;
}) {
  const total = pr.items.reduce((s, i) => s + i.qty * i.unitCost, 0);
  return (
    <div className="cv-sidebar">
      <div className="cv-sidebar-top">
        <div className="cv-sidebar-logo">
          <div className="cv-sidebar-emblem">🌾</div>
          <div className="cv-sidebar-brand">
            <div className="cv-sidebar-org">DAR · Procurement</div>
            <div className="cv-sidebar-title">Canvassing</div>
          </div>
        </div>
        <div className="cv-sidebar-module">
          <div>
            <span className="cv-sidebar-module-label">Current Phase</span>
            <span className="cv-sidebar-module-name">Phase 1 – Stage 2</span>
          </div>
        </div>
      </div>

      {/* PR reference card */}
      <div className="cv-pr-card">
        <div className="cv-pr-card-label">Purchase Request</div>
        <div className="cv-pr-no">{pr.prNo}</div>
        <div className="cv-pr-section">{pr.officeSection} · {pr.date}</div>
        <div className="cv-pr-items">
          {pr.items.map((item) => (
            <div className="cv-pr-item" key={item.id}>
              <span className="cv-pr-item-name">{item.desc}</span>
              <span className="cv-pr-item-cost">₱{fmt(item.qty * item.unitCost)}</span>
            </div>
          ))}
        </div>
        <div className="cv-pr-total">
          <span className="cv-pr-total-label">Total</span>
          <span className="cv-pr-total-val">₱{fmt(total)}</span>
        </div>
      </div>

      {/* Stage nav */}
      <div className="cv-nav">
        <div className="cv-nav-section-label">Canvass Stages</div>
        {STAGE_ORDER.map((stage, idx) => {
          const meta = STAGE_META[stage];
          const isActive = stage === currentStage;
          const isDone = completedStages.has(stage);
          return (
            <div key={stage} style={{ position: "relative" }}>
              <div
                className={`cv-nav-item${isActive ? " active" : ""}${isDone ? " done" : ""}`}
                onClick={() => isDone || isActive ? onNavigate(stage) : undefined}
                style={{ cursor: isDone || isActive ? "pointer" : "default" }}
              >
                <span className="cv-nav-icon">{meta.icon}</span>
                <div className="cv-nav-text">
                  <div className="cv-nav-step">Step {meta.step}</div>
                  <div className="cv-nav-name">{meta.label}</div>
                </div>
                {isDone && <span className="cv-nav-check">✓</span>}
              </div>
              {idx < STAGE_ORDER.length - 1 && <div className="cv-nav-connector" />}
            </div>
          );
        })}
      </div>

      <div className="cv-phase-badge">
        <span className="cv-phase-icon">📋</span>
        <div>
          <div className="cv-phase-label">Next Phase</div>
          <div className="cv-phase-name">Phase 2 – Evaluation</div>
        </div>
      </div>
    </div>
  );
}

// ── Step 6: PR Received ────────────────────────────────────────────────────────
function Step6PRReceived({ pr, onComplete }: { pr: PurchaseRequest; onComplete: () => void }) {
  const [bacNo, setBacNo] = useState("");
  const [receivedBy, setReceivedBy] = useState("Yvonne M.");
  const [notes, setNotes] = useState("");
  const isValid = bacNo.trim().length > 0;

  return (
    <div className="cv-fadein">
      <div className="cv-step-header">
        <div className="cv-step-header-left">
          <div className="cv-step-eyebrow">Stage 2 · Canvass & Resolution</div>
          <div className="cv-step-title">PR Received from PARPO</div>
          <div className="cv-step-desc">
            BAC receives the approved Purchase Request from PARPO&#39;s Office for preparation of the canvass sheet and BAC Resolution.
          </div>
        </div>
        <div className="cv-step-badge">
          <div className="cv-step-badge-num">06</div>
          <div className="cv-step-badge-label">Step</div>
        </div>
      </div>

      <div className="cv-alert info">
        <span className="cv-alert-icon">ℹ️</span>
        <div className="cv-alert-text">
          This PR has been <strong>approved by PARPO</strong> and budget has been earmarked. Assign a BAC canvass number and acknowledge receipt to proceed.
        </div>
      </div>

      {/* PR Summary */}
      <div className="cv-card">
        <div className="cv-card-title">Incoming Purchase Request</div>
        <div className="cv-info-grid" style={{ marginBottom: 16 }}>
          <div className="cv-info-item">
            <span className="cv-info-label">PR Number</span>
            <span className="cv-info-val mono">{pr.prNo}</span>
          </div>
          <div className="cv-info-item">
            <span className="cv-info-label">Date Filed</span>
            <span className="cv-info-val">{pr.date}</span>
          </div>
          <div className="cv-info-item">
            <span className="cv-info-label">Office / Section</span>
            <span className="cv-info-val">{pr.officeSection}</span>
          </div>
          <div className="cv-info-item">
            <span className="cv-info-label">Resp. Center Code</span>
            <span className="cv-info-val mono">{pr.responsibilityCode}</span>
          </div>
          <div className="cv-info-item">
            <span className="cv-info-label">Total Amount</span>
            <span className="cv-info-val mono" style={{ color: "var(--gm)", fontWeight: 700 }}>₱{fmt(prTotal)}</span>
          </div>
          <div className="cv-info-item">
            <span className="cv-info-label">Items Count</span>
            <span className="cv-info-val">{pr.items.length} line items</span>
          </div>
        </div>

        <table className="cv-table">
          <thead>
            <tr>
              <th>Stock/Prop No.</th>
              <th>Item Description</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Est. Unit Cost</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {pr.items.map((item) => (
              <tr key={item.id}>
                <td className="mono">{item.stock}</td>
                <td>{item.desc}</td>
                <td>{item.unit}</td>
                <td className="mono">{item.qty}</td>
                <td className="mono">₱{fmt(item.unitCost)}</td>
                <td className="mono" style={{ fontWeight: 600 }}>₱{fmt(item.qty * item.unitCost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* BAC Acknowledgement */}
      <div className="cv-card">
        <div className="cv-card-title">BAC Acknowledgement</div>
        <div className="cv-grid3" style={{ marginBottom: 14 }}>
          <div className="cv-field">
            <label className="cv-label">BAC Canvass No. <span className="cv-req">*</span></label>
            <input
              className="cv-input"
              placeholder="e.g. 2026-BAC-0042"
              value={bacNo}
              onChange={(e) => setBacNo(e.target.value)}
            />
          </div>
          <div className="cv-field">
            <label className="cv-label">Received By <span className="cv-req">*</span></label>
            <select className="cv-select" value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)}>
              <option>Yvonne M.</option>
              <option>Mariel T.</option>
            </select>
          </div>
          <div className="cv-field">
            <label className="cv-label">Date Received</label>
            <input className="cv-input ro" value={TODAY_STR} readOnly />
          </div>
        </div>
        <div className="cv-field">
          <label className="cv-label">Remarks / Notes</label>
          <textarea className="cv-textarea" placeholder="Any observations or notes on the received PR…" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="cv-btn ghost">Save Draft</button>
        <button className="cv-btn primary" disabled={!isValid} onClick={onComplete}>
          Acknowledge & Proceed →
        </button>
      </div>
    </div>
  );
}

// ── Step 7: BAC Resolution ────────────────────────────────────────────────────
function Step7BACResolution({
  pr, bacMembers, setBACMembers, onComplete,
}: {
  pr: PurchaseRequest;
  bacMembers: BACMember[];
  setBACMembers: React.Dispatch<React.SetStateAction<BACMember[]>>;
  onComplete: () => void;
}) {
  const [resolutionNo, setResolutionNo] = useState("2026-RES-0042");
  const [modeOfProc, setModeOfProc] = useState("Small Value Procurement (SVP)");
  const [justification, setJustification] = useState("The procurement amount is below the threshold for competitive bidding as prescribed under RA 9184 and its IRR.");

  const signMember = (idx: number) => {
    const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    setBACMembers((m) => m.map((mb, i) => i === idx ? { ...mb, signed: true, signedAt: now } : mb));
  };

  const allSigned = bacMembers.every((m) => m.signed);

  return (
    <div className="cv-fadein">
      <div className="cv-step-header">
        <div className="cv-step-header-left">
          <div className="cv-step-eyebrow">Stage 2 · Canvass & Resolution</div>
          <div className="cv-step-title">BAC Resolution</div>
          <div className="cv-step-desc">
            Prepare the BAC Resolution indicating the mode of procurement and release to all BAC members and PARPO II for signature.
          </div>
        </div>
        <div className="cv-step-badge">
          <div className="cv-step-badge-num">07</div>
          <div className="cv-step-badge-label">Step</div>
        </div>
      </div>

      {/* Resolution form */}
      <div className="cv-card">
        <div className="cv-card-title">Resolution Details</div>
        <div className="cv-grid2" style={{ marginBottom: 14 }}>
          <div className="cv-field">
            <label className="cv-label">Resolution No. <span className="cv-req">*</span></label>
            <input className="cv-input" value={resolutionNo} onChange={(e) => setResolutionNo(e.target.value)} />
          </div>
          <div className="cv-field">
            <label className="cv-label">Date Prepared</label>
            <input className="cv-input ro" value={TODAY_STR} readOnly />
          </div>
          <div className="cv-field">
            <label className="cv-label">Mode of Procurement <span className="cv-req">*</span></label>
            <select className="cv-select" value={modeOfProc} onChange={(e) => setModeOfProc(e.target.value)}>
              <option>Small Value Procurement (SVP)</option>
              <option>Competitive Bidding</option>
              <option>Direct Contracting</option>
              <option>Shopping</option>
              <option>Negotiated Procurement</option>
            </select>
          </div>
          <div className="cv-field">
            <label className="cv-label">PR Reference</label>
            <input className="cv-input ro" value={pr.prNo} readOnly />
          </div>
        </div>
        <div className="cv-field">
          <label className="cv-label">Legal Basis / Justification <span className="cv-req">*</span></label>
          <textarea className="cv-textarea" value={justification} onChange={(e) => setJustification(e.target.value)} />
        </div>
      </div>

      {/* BAC Signatures */}
      <div className="cv-card">
        <div className="cv-card-title">
          Signatories
          <span className="tag">{bacMembers.filter((m) => m.signed).length}/{bacMembers.length} signed</span>
        </div>

        {!allSigned && (
          <div className="cv-alert warning">
            <span className="cv-alert-icon">⚠️</span>
            <div className="cv-alert-text">
              All BAC members and PARPO II must sign before the canvass can be released. Click <strong>Sign</strong> to mark as signed (simulating physical signature workflow).
            </div>
          </div>
        )}

        <div className="cv-bac-members">
          {bacMembers.map((member, idx) => (
            <div key={member.name} className={`cv-bac-member${member.signed ? " signed" : ""}`}>
              <div className="cv-bac-member-info">
                <div className="cv-bac-avatar">
                  {member.signed ? "✓" : member.name[0]}
                </div>
                <div>
                  <div className="cv-bac-name">{member.name}</div>
                  <div className="cv-bac-role">{member.designation}</div>
                </div>
              </div>
              {member.signed ? (
                <div className="cv-signed-tag">
                  ✅ Signed <span className="cv-signed-time">at {member.signedAt}</span>
                </div>
              ) : (
                <button className="cv-sign-btn" onClick={() => signMember(idx)}>
                  ✍️ Sign
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="cv-btn ghost">Save Draft</button>
        <button className="cv-btn primary" disabled={!allSigned} onClick={onComplete}>
          Resolution Finalized → Release Canvass
        </button>
      </div>
    </div>
  );
}

// ── Step 8: Release Canvass ───────────────────────────────────────────────────
function Step8ReleaseCanvass({
  canvassers, setCanvassers, onComplete,
}: {
  canvassers: CanvassEntry[];
  setCanvassers: React.Dispatch<React.SetStateAction<CanvassEntry[]>>;
  onComplete: () => void;
}) {
  const released = canvassers.filter((c) => c.status !== "pending").length;
  const pct = Math.round((released / canvassers.length) * 100);

  const releaseOne = (idx: number) => {
    setCanvassers((c) =>
      c.map((cv, i) =>
        i === idx ? { ...cv, status: "released", releaseDate: TODAY_STR } : cv
      )
    );
  };

  const releaseAll = () => {
    setCanvassers((c) => c.map((cv) => ({ ...cv, status: "released", releaseDate: TODAY_STR })));
  };

  const allReleased = canvassers.every((c) => c.status !== "pending");

  return (
    <div className="cv-fadein">
      <div className="cv-step-header">
        <div className="cv-step-header-left">
          <div className="cv-step-eyebrow">Stage 2 · Canvass & Resolution</div>
          <div className="cv-step-title">Release Canvass to Divisions</div>
          <div className="cv-step-desc">
            Release canvass sheets to designated canvassers per division. Canvassers must return completed forms within <strong>7 days</strong>.
          </div>
        </div>
        <div className="cv-step-badge">
          <div className="cv-step-badge-num">08</div>
          <div className="cv-step-badge-label">Step</div>
        </div>
      </div>

      <div className="cv-alert warning">
        <span className="cv-alert-icon">⚠️</span>
        <div className="cv-alert-text">
          <strong>Availability reminder:</strong> Verify that canvassers are not on travel before releasing. Canvass must be returned within 7 days of release date.
        </div>
      </div>

      {/* Progress */}
      <div className="cv-progress-row">
        <div className="cv-progress-bar-wrap">
          <div className="cv-progress-label">
            <span>Release Progress</span>
            <span>{released} of {canvassers.length} divisions</span>
          </div>
          <div className="cv-progress-bar">
            <div className="cv-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="cv-progress-stat">
          <div className="cv-progress-num">{pct}%</div>
          <div className="cv-progress-sublabel">Released</div>
        </div>
      </div>

      {/* Canvassers list */}
      <div className="cv-card">
        <div className="cv-card-title">
          Canvassers by Division
          {!allReleased && (
            <button
              className="cv-btn primary"
              style={{ fontSize: 11, padding: "4px 12px", marginLeft: "auto" }}
              onClick={releaseAll}
            >
              Release All
            </button>
          )}
        </div>
        <div className="cv-div-rows">
          {canvassers.map((cv, idx) => (
            <div key={cv.divisionSection} className={`cv-div-row${cv.status === "released" ? " released" : ""}`}>
              <span className="cv-div-section">{cv.divisionSection}</span>
              <span className="cv-div-canvasser">{cv.canvasserName}</span>
              <span className="cv-div-date">{cv.releaseDate || "—"}</span>
              <span className={`cv-div-status ${cv.status}`}>
                {cv.status.charAt(0).toUpperCase() + cv.status.slice(1)}
              </span>
              <div className="cv-div-action">
                {cv.status === "pending" ? (
                  <button className="cv-action-btn release" onClick={() => releaseOne(idx)}>
                    📤 Release
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--ga)", fontWeight: 600 }}>✓ Released</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="cv-btn ghost">Save Draft</button>
        <button className="cv-btn primary" disabled={!allReleased} onClick={onComplete}>
          All Released → Await Returns
        </button>
      </div>
    </div>
  );
}

// ── Step 9: Collect Canvass ───────────────────────────────────────────────────
function Step9CollectCanvass({
  pr, canvassers, setCanvassers, suppliers, setSuppliers, onComplete,
}: {
  pr: PurchaseRequest;
  canvassers: CanvassEntry[];
  setCanvassers: React.Dispatch<React.SetStateAction<CanvassEntry[]>>;
  suppliers: SupplierQuote[];
  setSuppliers: React.Dispatch<React.SetStateAction<SupplierQuote[]>>;
  onComplete: () => void;
}) {
  const nextSuppId = useRef(suppliers.length + 1);

  const addSupplier = () => {
    const id = nextSuppId.current++;
    setSuppliers((s) => [...s, {
      id, supplierName: "", address: "", contactNo: "", tinNo: "",
      deliveryDays: "", unitPrices: {}, remarks: "",
    }]);
  };

  const removeSupplier = (id: number) =>
    setSuppliers((s) => s.filter((sp) => sp.id !== id));

  const updateSupplier = (id: number, field: keyof SupplierQuote, value: string) =>
    setSuppliers((s) => s.map((sp) => sp.id === id ? { ...sp, [field]: value } : sp));

  const updatePrice = (suppId: number, itemId: number, val: string) =>
    setSuppliers((s) =>
      s.map((sp) =>
        sp.id === suppId
          ? { ...sp, unitPrices: { ...sp.unitPrices, [itemId]: val } }
          : sp
      )
    );

  const markReturned = (idx: number) => {
    setCanvassers((c) => c.map((cv, i) => i === idx ? { ...cv, status: "returned", returnDate: TODAY_STR } : cv));
  };

  const returned = canvassers.filter((c) => c.status === "returned").length;
  const pct = Math.round((returned / canvassers.length) * 100);

  const hasQuotes = suppliers.some((sp) =>
    sp.supplierName && Object.keys(sp.unitPrices).length > 0
  );

  return (
    <div className="cv-fadein">
      <div className="cv-step-header">
        <div className="cv-step-header-left">
          <div className="cv-step-eyebrow">Stage 2 · Canvass & Resolution</div>
          <div className="cv-step-title">Receive Filled-Out Canvass</div>
          <div className="cv-step-desc">
            Collect completed canvass forms from all canvassers and encode supplier quotations for comparison. Submission must be within 7 days of release.
          </div>
        </div>
        <div className="cv-step-badge">
          <div className="cv-step-badge-num">09</div>
          <div className="cv-step-badge-label">Step</div>
        </div>
      </div>

      {/* Return tracking */}
      <div className="cv-progress-row">
        <div className="cv-progress-bar-wrap">
          <div className="cv-progress-label">
            <span>Returns Received</span>
            <span>{returned} of {canvassers.length} divisions</span>
          </div>
          <div className="cv-progress-bar">
            <div className="cv-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <div className="cv-progress-stat">
          <div className="cv-progress-num">{returned}</div>
          <div className="cv-progress-sublabel">Returned</div>
        </div>
      </div>

      <div className="cv-card">
        <div className="cv-card-title">Track Canvass Returns</div>
        <div className="cv-div-rows">
          {canvassers.map((cv, idx) => (
            <div
              key={cv.divisionSection}
              className={`cv-div-row${cv.status === "returned" ? " released" : ""}`}
            >
              <span className="cv-div-section">{cv.divisionSection}</span>
              <span className="cv-div-canvasser">{cv.canvasserName}</span>
              <span className="cv-div-date">{cv.returnDate || `Due: ${cv.releaseDate}`}</span>
              <span className={`cv-div-status ${cv.status === "returned" ? "returned" : "released"}`}>
                {cv.status === "returned" ? "Returned" : "Pending"}
              </span>
              <div className="cv-div-action">
                {cv.status !== "returned" ? (
                  <button className="cv-action-btn receive" onClick={() => markReturned(idx)}>
                    📥 Receive
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "var(--blue)", fontWeight: 600 }}>✓ Received</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Supplier quote encoding */}
      <div className="cv-card">
        <div className="cv-card-title">
          Supplier Quotations
          <span className="tag">{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</span>
        </div>

        {suppliers.map((sp, sIdx) => (
          <div key={sp.id} className="cv-supplier-block">
            <div className="cv-supplier-header">
              <div className="cv-supplier-name-row">
                <div className="cv-supplier-num">{sIdx + 1}</div>
                <span className="cv-supplier-title">
                  {sp.supplierName || `Supplier ${sIdx + 1}`}
                </span>
              </div>
              <button className="cv-supplier-del-btn" onClick={() => removeSupplier(sp.id)}>
                ✕ Remove
              </button>
            </div>
            <div className="cv-supplier-body">
              <div className="cv-supplier-meta">
                <div className="cv-field">
                  <label className="cv-label">Supplier Name <span className="cv-req">*</span></label>
                  <input className="cv-input" placeholder="Business / trade name" value={sp.supplierName}
                    onChange={(e) => updateSupplier(sp.id, "supplierName", e.target.value)} />
                </div>
                <div className="cv-field">
                  <label className="cv-label">Contact No.</label>
                  <input className="cv-input" placeholder="09XX-XXX-XXXX" value={sp.contactNo}
                    onChange={(e) => updateSupplier(sp.id, "contactNo", e.target.value)} />
                </div>
                <div className="cv-field">
                  <label className="cv-label">Delivery (days)</label>
                  <input className="cv-input" placeholder="e.g. 7" value={sp.deliveryDays}
                    onChange={(e) => updateSupplier(sp.id, "deliveryDays", e.target.value)} />
                </div>
                <div className="cv-field" style={{ gridColumn: "span 2" }}>
                  <label className="cv-label">Address</label>
                  <input className="cv-input" placeholder="Business address" value={sp.address}
                    onChange={(e) => updateSupplier(sp.id, "address", e.target.value)} />
                </div>
                <div className="cv-field">
                  <label className="cv-label">TIN No.</label>
                  <input className="cv-input" placeholder="000-000-000" value={sp.tinNo}
                    onChange={(e) => updateSupplier(sp.id, "tinNo", e.target.value)} />
                </div>
              </div>

              {/* Unit price per item */}
              <div>
                <div className="cv-label" style={{ marginBottom: 8 }}>Unit Prices Quoted (₱)</div>
                <table className="cv-table" style={{ fontSize: 12 }}>
                  <thead>
                    <tr>
                      <th>Item Description</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th>Unit Price (₱)</th>
                      <th>Line Total (₱)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.items.map((item) => {
                      const price = parseFloat(sp.unitPrices[item.id] || "0") || 0;
                      return (
                        <tr key={item.id}>
                          <td>{item.desc}</td>
                          <td>{item.unit}</td>
                          <td className="mono">{item.qty}</td>
                          <td>
                            <input
                              className="cv-quote-input"
                              type="number" min="0" step="0.01"
                              placeholder="0.00"
                              value={sp.unitPrices[item.id] ?? ""}
                              onChange={(e) => updatePrice(sp.id, item.id, e.target.value)}
                            />
                          </td>
                          <td className="mono" style={{ color: "var(--gm)", fontWeight: 600 }}>
                            {price > 0 ? `₱${fmt(price * item.qty)}` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="cv-field">
                <label className="cv-label">Remarks</label>
                <input className="cv-input" placeholder="Warranty, terms, notes…" value={sp.remarks}
                  onChange={(e) => updateSupplier(sp.id, "remarks", e.target.value)} />
              </div>
            </div>
          </div>
        ))}

        <button className="cv-add-supplier-btn" onClick={addSupplier}>
          ＋ Add Supplier Quote
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <button className="cv-btn ghost">Save Draft</button>
        <button className="cv-btn primary" disabled={!hasQuotes} onClick={onComplete}>
          Encode Complete → Prepare AAA
        </button>
      </div>
    </div>
  );
}

// ── Step 10: Abstract of Awards ───────────────────────────────────────────────
function Step10AAA({
  pr, suppliers, bacMembers, setBACMembers, onComplete,
}: {
  pr: PurchaseRequest;
  suppliers: SupplierQuote[];
  bacMembers: BACMember[];
  setBACMembers: React.Dispatch<React.SetStateAction<BACMember[]>>;
  onComplete: () => void;
}) {
  // Reset signatures for AAA signing
  const [aaaMembers, setAAAMembers] = useState<BACMember[]>(
    bacMembers.map((m) => ({ ...m, signed: false, signedAt: "" }))
  );
  const [aaaNo, setAAANo] = useState("2026-AAA-0042");

  // Compute winner per item (lowest price)
  const computeWinner = (itemId: number): { suppId: number; price: number } | null => {
    let best: { suppId: number; price: number } | null = null;
    for (const sp of suppliers) {
      const p = parseFloat(sp.unitPrices[itemId] || "0") || 0;
      if (p > 0 && (!best || p < best.price)) best = { suppId: sp.id, price: p };
    }
    return best;
  };

  const itemWinners = pr.items.map((item) => ({
    item,
    winner: computeWinner(item.id),
  }));

  // Grand total per supplier
  const supplierTotals = suppliers.map((sp) => ({
    sp,
    total: pr.items.reduce((s, item) => {
      const p = parseFloat(sp.unitPrices[item.id] || "0") || 0;
      return s + p * item.qty;
    }, 0),
  }));

  const lowestSupplier = supplierTotals.reduce(
    (best, cur) => (cur.total > 0 && (!best || cur.total < best.total) ? cur : best),
    null as typeof supplierTotals[0] | null
  );

  const signMember = (idx: number) => {
    const now = new Date().toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
    setAAAMembers((m) => m.map((mb, i) => i === idx ? { ...mb, signed: true, signedAt: now } : mb));
  };

  const allSigned = aaaMembers.every((m) => m.signed);

  return (
    <div className="cv-fadein">
      <div className="cv-step-header">
        <div className="cv-step-header-left">
          <div className="cv-step-eyebrow">Stage 2 · Canvass & Resolution</div>
          <div className="cv-step-title">Abstract of Awards</div>
          <div className="cv-step-desc">
            Prepare the AAA summarizing all supplier quotations. The lowest compliant bidder is recommended. Release to BAC members and PARPO II for signature.
          </div>
        </div>
        <div className="cv-step-badge">
          <div className="cv-step-badge-num">10</div>
          <div className="cv-step-badge-label">Step</div>
        </div>
      </div>

      <div className="cv-card">
        <div className="cv-card-title">AAA Details</div>
        <div className="cv-grid3">
          <div className="cv-field">
            <label className="cv-label">AAA No.</label>
            <input className="cv-input" value={aaaNo} onChange={(e) => setAAANo(e.target.value)} />
          </div>
          <div className="cv-field">
            <label className="cv-label">PR Reference</label>
            <input className="cv-input ro" value={pr.prNo} readOnly />
          </div>
          <div className="cv-field">
            <label className="cv-label">Date Prepared</label>
            <input className="cv-input ro" value={TODAY_STR} readOnly />
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="cv-card">
        <div className="cv-card-title">Canvass Price Comparison</div>
        <div className="cv-aaa-wrap">
          <table className="cv-aaa-table">
            <thead>
              <tr>
                <th>Item Description</th>
                <th>Unit</th>
                <th>Qty</th>
                {suppliers.map((sp, i) => (
                  <th key={sp.id}>{sp.supplierName || `Supplier ${i + 1}`}</th>
                ))}
                <th>Lowest Price</th>
                <th>Awarded To</th>
              </tr>
            </thead>
            <tbody>
              {pr.items.map((item) => {
                const winner = computeWinner(item.id);
                const lowestSupp = winner ? suppliers.find((s) => s.id === winner.suppId) : null;
                return (
                  <tr key={item.id} className={winner ? "winner-row" : ""}>
                    <td>{item.desc}</td>
                    <td>{item.unit}</td>
                    <td className="mono">{item.qty}</td>
                    {suppliers.map((sp) => {
                      const p = parseFloat(sp.unitPrices[item.id] || "0") || 0;
                      const isLowest = winner?.suppId === sp.id;
                      return (
                        <td key={sp.id} className={`mono${isLowest ? " lowest" : ""}`}>
                          {p > 0 ? `₱${fmt(p)}` : "—"}
                        </td>
                      );
                    })}
                    <td className="mono lowest">
                      {winner ? `₱${fmt(winner.price)}` : "—"}
                    </td>
                    <td style={{ fontWeight: 600, color: "var(--gm)" }}>
                      {lowestSupp?.supplierName || "—"}
                    </td>
                  </tr>
                );
              })}
              {/* Totals row */}
              <tr style={{ background: "var(--bg2)" }}>
                <td colSpan={3} style={{ fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted)" }}>Grand Total</td>
                {supplierTotals.map(({ sp, total }) => (
                  <td key={sp.id} className="mono" style={{ fontWeight: 700 }}>
                    {total > 0 ? `₱${fmt(total)}` : "—"}
                  </td>
                ))}
                <td className="mono lowest" style={{ fontWeight: 700 }}>
                  {lowestSupplier ? `₱${fmt(lowestSupplier.total)}` : "—"}
                </td>
                <td style={{ fontWeight: 700, color: "var(--gm)" }}>
                  {lowestSupplier?.sp.supplierName || "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {lowestSupplier && (
          <div className="cv-alert info" style={{ marginTop: 14 }}>
            <span className="cv-alert-icon">🏆</span>
            <div className="cv-alert-text">
              Recommended awardee: <strong>{lowestSupplier.sp.supplierName}</strong> with a total quoted price of <strong>₱{fmt(lowestSupplier.total)}</strong> — lowest among all submitted quotations.
            </div>
          </div>
        )}
      </div>

      {/* AAA Signatories */}
      <div className="cv-card">
        <div className="cv-card-title">
          AAA Signatories
          <span className="tag">{aaaMembers.filter((m) => m.signed).length}/{aaaMembers.length} signed</span>
        </div>
        <div className="cv-bac-members">
          {aaaMembers.map((member, idx) => (
            <div key={member.name} className={`cv-bac-member${member.signed ? " signed" : ""}`}>
              <div className="cv-bac-member-info">
                <div className="cv-bac-avatar">{member.signed ? "✓" : member.name[0]}</div>
                <div>
                  <div className="cv-bac-name">{member.name}</div>
                  <div className="cv-bac-role">{member.designation}</div>
                </div>
              </div>
              {member.signed ? (
                <div className="cv-signed-tag">✅ Signed <span className="cv-signed-time">at {member.signedAt}</span></div>
              ) : (
                <button className="cv-sign-btn" onClick={() => signMember(idx)}>✍️ Sign</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {allSigned && (
        <div className="cv-next-phase">
          <div className="cv-next-phase-left">
            <div className="cv-next-phase-eyebrow">Canvassing Complete ✓</div>
            <div className="cv-next-phase-title">Proceed to Phase 2 – Evaluation</div>
            <div className="cv-next-phase-sub">
              AAA signed by all parties. Forward to Supply Section with PR, canvass sheets, BAC Resolution, and supplier proposals.
            </div>
          </div>
          <button className="cv-btn gold" onClick={onComplete}>
            Forward to Supply Section →
          </button>
        </div>
      )}

      {!allSigned && (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button className="cv-btn ghost">Save Draft</button>
          <button className="cv-btn primary" disabled>
            Awaiting Signatures…
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function CanvassingModule() {
  const [stage, setStage] = useState<CanvassStage>("pr_received");
  const [completed, setCompleted] = useState<Set<CanvassStage>>(new Set());
  const [bacMembers, setBACMembers] = useState<BACMember[]>(initBACMembers);
  const [canvassers, setCanvassers] = useState<CanvassEntry[]>(initCanvassers);
  const [suppliers, setSuppliers] = useState<SupplierQuote[]>(initSuppliers);

  // Inject CSS
  useEffect(() => {
    if (!document.getElementById("cv-styles")) {
      const tag = document.createElement("style");
      tag.id = "cv-styles";
      tag.textContent = CSS;
      document.head.appendChild(tag);
    }
  }, []);

  const completeStage = (current: CanvassStage) => {
    setCompleted((s) => new Set([...s, current]));
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < STAGE_ORDER.length - 1) setStage(STAGE_ORDER[idx + 1]);
  };

  const meta = STAGE_META[stage];

  return (
    <div className="cv-root">
      <div className="cv-layout">
        {/* Sidebar */}
        <PRSidebar
          pr={MOCK_PR}
          currentStage={stage}
          completedStages={completed}
          onNavigate={setStage}
        />

        {/* Main content */}
        <div className="cv-main">
          {/* Top bar */}
          <div className="cv-topbar">
            <div className="cv-topbar-left">
              <div className="cv-breadcrumb">
                <span>Procurement</span>
                <span className="cv-breadcrumb-sep">›</span>
                <span>Purchase Request</span>
                <span className="cv-breadcrumb-sep">›</span>
                <span className="cv-breadcrumb-active">Canvassing</span>
              </div>
              <div className="cv-stage-pill canvass">Phase 1 – Stage 2</div>
            </div>
            <div className="cv-topbar-right">
              <div className="cv-deadline-chip">
                ⏱ 7-day canvass window
              </div>
            </div>
          </div>

          {/* Step content */}
          <div className="cv-content">
            {stage === "pr_received" && (
              <Step6PRReceived pr={MOCK_PR} onComplete={() => completeStage("pr_received")} />
            )}
            {stage === "bac_resolution" && (
              <Step7BACResolution
                pr={MOCK_PR}
                bacMembers={bacMembers}
                setBACMembers={setBACMembers}
                onComplete={() => completeStage("bac_resolution")}
              />
            )}
            {stage === "release_canvass" && (
              <Step8ReleaseCanvass
                canvassers={canvassers}
                setCanvassers={setCanvassers}
                onComplete={() => completeStage("release_canvass")}
              />
            )}
            {stage === "collect_canvass" && (
              <Step9CollectCanvass
                pr={MOCK_PR}
                canvassers={canvassers}
                setCanvassers={setCanvassers}
                suppliers={suppliers}
                setSuppliers={setSuppliers}
                onComplete={() => completeStage("collect_canvass")}
              />
            )}
            {stage === "aaa_preparation" && (
              <Step10AAA
                pr={MOCK_PR}
                suppliers={suppliers}
                bacMembers={bacMembers}
                setBACMembers={setBACMembers}
                onComplete={() => completeStage("aaa_preparation")}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
