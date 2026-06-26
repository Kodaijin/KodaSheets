/**********************************************************************
 * Koda Sheets — Card Sheet Imposition Script for Adobe Photoshop
 * Run via:  File > Scripts > Browse...  and pick this file.
 *
 * Tiles individual card images from a folder onto print sheets, with:
 *   - automatic front/back pairing by filename
 *   - duplex (double-sided) back sheets that mirror for flip alignment
 *   - backside registration calibration (X/Y mm offset)
 *   - corner crop marks OR full gutter gridlines
 *   - a numbered test reference sheet to dial in duplex alignment
 *   - multi-sheet pagination for full decks
 *
 * ExtendScript (ES3) — uses the classic Photoshop DOM. Works through
 * Photoshop 2025. No install required.
 *
 * Naming convention for backs (case-insensitive, separator = space/_/-):
 *   "1 sample.png"        -> Front 1
 *   "1 sample back.png"   -> Back of Front 1
 *   "2 hero_back.png"     -> Back of Front 2
 *   "quarterback.png"     -> Front (no separator before "back")
 * A front with no matching back uses the shared back image if set,
 * otherwise a blank white back.
 *********************************************************************/

#target photoshop

(function () {

    // ======================================================================
    // SECTION 1 — Constants
    // ======================================================================

    var MM_PER_INCH = 25.4;

    // [label, widthMm, heightMm]
    var PAPER_PRESETS = [
        ["US Letter (216x279)", 216, 279],
        ["A4 (210x297)", 210, 297],
        ["Custom", 0, 0]
    ];
    var CARD_PRESETS = [
        ["Poker (63x88)", 63, 88],
        ["Bridge (56x88)", 56, 88],
        ["Tarot (70x120)", 70, 120],
        ["Standard TCG (63x88)", 63, 88],
        ["Custom", 0, 0]
    ];
    var CUTMARK_STYLES = ["Corner crop marks", "Full gutter gridlines"];
    var PLACEMENT_MODES = ["Smart Object", "Rasterized"];
    var DUPLEX_FLIPS = ["Long edge (left-right)", "Short edge (top-bottom)"];
    // [label, cols, rows] — cols/rows of 0 means Auto (fit as many as possible).
    var LAYOUT_STYLES = [
        ["Auto (fit max)", 0, 0],
        ["3 x 3", 3, 3],
        ["2 x 4", 2, 4],
        ["2 x 3", 2, 3]
    ];

    var SETTINGS_KEY = "kodaSheetsImposition_v1";

    var LOG = [];
    function log(s) { LOG.push(String(s)); }

    function defaultSettings() {
        return {
            folder: "",
            sharedBack: "",
            paperPreset: 0,
            paperW: 216, paperH: 279,
            cardPreset: 0,
            cardW: 63, cardH: 88,
            ppi: 1200,
            margin: 5,
            gutter: 2,
            cutMarksOn: false,
            cutMarksStyle: 0,
            placement: 0,
            duplex: true,
            duplexFlip: 1,   // short edge (top-bottom) is the common home-printer default
            offX: 0,
            offY: 0,
            bleedOn: false,
            bleedMm: 3.175,  // 1/8 inch per edge
            layoutStyle: 0
        };
    }

    // ======================================================================
    // SECTION 2 — Units & layout math (ported from src/engine, ES3)
    // ======================================================================

    function mmToPx(mm, ppi) { return mm / MM_PER_INCH * ppi; }
    function mmToPxRound(mm, ppi) { return Math.round(mmToPx(mm, ppi)); }
    function ptToPx(pt, ppi) { return pt / 72 * ppi; }

    // How many cards fit along one axis (n cards + (n-1) gutters <= available).
    function fitCount(available, cardDim, gutter) {
        if (cardDim <= 0) return 0;
        var g = gutter > 0 ? gutter : 0;
        var n = Math.floor((available + g) / (cardDim + g));
        return n > 0 ? n : 0;
    }

    function blockDim(n, dim, gutter) { return n * dim + (n > 0 ? n - 1 : 0) * gutter; }
    function blockFits(cols, rows, cw, ch, gutter, usableW, usableH) {
        return blockDim(cols, cw, gutter) <= usableW && blockDim(rows, ch, gutter) <= usableH;
    }

    // config: { paperW,paperH,cardW,cardH,margin,gutter,ppi,allowRotate,
    //           reserveGutterForMarks, forceCols, forceRows }
    // forceCols/forceRows (>0) pin the grid; orientation is then auto-chosen to
    // best fit. Otherwise the grid is maximized automatically (Auto).
    function computeLayout(config) {
        var allowRotate = (config.allowRotate === undefined) ? true : config.allowRotate;
        var reserve = !!config.reserveGutterForMarks;
        var gutter = (reserve && config.gutter === 0) ? 2 : config.gutter;

        var usableW = config.paperW - 2 * config.margin;
        var usableH = config.paperH - 2 * config.margin;

        var cols, rows, rotated = false, fits = true;

        if (config.forceCols > 0 && config.forceRows > 0) {
            cols = config.forceCols; rows = config.forceRows;
            var fitsNormal = blockFits(cols, rows, config.cardW, config.cardH, gutter, usableW, usableH);
            var fitsRot = allowRotate &&
                blockFits(cols, rows, config.cardH, config.cardW, gutter, usableW, usableH);
            if (!fitsNormal && fitsRot) { rotated = true; fits = true; }
            else { fits = fitsNormal; }
        } else {
            var upCols = fitCount(usableW, config.cardW, gutter);
            var upRows = fitCount(usableH, config.cardH, gutter);
            var upCount = upCols * upRows;
            cols = upCols; rows = upRows;
            if (allowRotate) {
                var rCols = fitCount(usableW, config.cardH, gutter);
                var rRows = fitCount(usableH, config.cardW, gutter);
                if (rCols * rRows > upCount) {
                    cols = rCols; rows = rRows; rotated = true;
                }
            }
        }

        var cardWmm = rotated ? config.cardH : config.cardW;
        var cardHmm = rotated ? config.cardW : config.cardH;

        var blockW = cols * cardWmm + (cols > 0 ? cols - 1 : 0) * gutter;
        var blockH = rows * cardHmm + (rows > 0 ? rows - 1 : 0) * gutter;
        var startX = config.margin + (usableW - blockW) / 2;
        var startY = config.margin + (usableH - blockH) / 2;

        var slots = [];
        for (var row = 0; row < rows; row++) {
            for (var col = 0; col < cols; col++) {
                var xMm = startX + col * (cardWmm + gutter);
                var yMm = startY + row * (cardHmm + gutter);
                slots.push({
                    index: row * cols + col, row: row, col: col,
                    xMm: xMm, yMm: yMm, wMm: cardWmm, hMm: cardHmm,
                    xPx: mmToPx(xMm, config.ppi), yPx: mmToPx(yMm, config.ppi),
                    wPx: mmToPx(cardWmm, config.ppi), hPx: mmToPx(cardHmm, config.ppi)
                });
            }
        }
        return { cols: cols, rows: rows, count: cols * rows, rotated: rotated,
                 fits: fits, cardWmm: cardWmm, cardHmm: cardHmm, slots: slots };
    }

    // Same-row horizontal mirror — duplex back for a LONG-edge (left-right) flip.
    function mirrorIndex(index, cols) {
        var row = Math.floor(index / cols);
        var col = index % cols;
        return row * cols + (cols - 1 - col);
    }
    // Same-column vertical mirror — duplex back for a SHORT-edge (top-bottom) flip.
    function mirrorIndexV(index, cols, rows) {
        var row = Math.floor(index / cols);
        var col = index % cols;
        return (rows - 1 - row) * cols + col;
    }

    // ======================================================================
    // SECTION 3 — Folder scan, front/back pairing, natural sort
    // ======================================================================

    function fileBaseName(file) {
        var n = decodeURI(file.name);
        var dot = n.lastIndexOf(".");
        return dot > 0 ? n.substring(0, dot) : n;
    }

    var BACK_RE = /[ _\-]back$/i;
    function isBackBase(base) { return BACK_RE.test(base); }
    function frontKeyOfBack(base) { return base.replace(BACK_RE, ""); }

    // Natural (numeric-aware) string comparison.
    function chunkify(s) {
        var m = s.match(/(\d+|\D+)/g);
        return m ? m : [];
    }
    function naturalCompare(a, b) {
        var ax = chunkify(a.toLowerCase());
        var bx = chunkify(b.toLowerCase());
        var i, len = Math.min(ax.length, bx.length);
        for (i = 0; i < len; i++) {
            var as = ax[i], bs = bx[i];
            var aNum = /^\d/.test(as), bNum = /^\d/.test(bs);
            if (aNum && bNum) {
                var an = parseFloat(as), bn = parseFloat(bs);
                if (an !== bn) return an < bn ? -1 : 1;
            } else {
                if (as < bs) return -1;
                if (as > bs) return 1;
            }
        }
        return ax.length - bx.length;
    }

    /**
     * Scan a folder and pair fronts with backs.
     * Returns { fronts: [ {file, base, back(File|null), hasOwnBack} ],
     *           backsUnmatched: [base...], total }
     * sharedBackFile is used as fallback when a front has no own back.
     */
    function scanFolder(folder, sharedBackFile) {
        var files = folder.getFiles(function (f) {
            return (f instanceof File) && /\.(png|jpg|jpeg)$/i.test(f.name);
        });
        var fronts = [];
        var backs = {};       // lowercased frontKey -> File
        var backBases = [];   // for unmatched reporting

        var i;
        for (i = 0; i < files.length; i++) {
            var f = files[i];
            if (!(f instanceof File)) continue;
            var base = fileBaseName(f);
            if (isBackBase(base)) {
                var key = frontKeyOfBack(base).toLowerCase();
                backs[key] = f;
                backBases.push(base);
            } else {
                fronts.push({ file: f, base: base });
            }
        }

        fronts.sort(function (a, b) { return naturalCompare(a.base, b.base); });

        var matchedKeys = {};
        for (i = 0; i < fronts.length; i++) {
            var fk = fronts[i].base.toLowerCase();
            if (backs[fk]) {
                fronts[i].back = backs[fk];
                fronts[i].hasOwnBack = true;
                matchedKeys[fk] = true;
            } else {
                fronts[i].back = sharedBackFile ? sharedBackFile : null;
                fronts[i].hasOwnBack = false;
            }
        }

        // Unmatched backs (a back file whose front is absent)
        var unmatched = [];
        var bi;
        for (bi = 0; bi < backBases.length; bi++) {
            var bkey = frontKeyOfBack(backBases[bi]).toLowerCase();
            if (!matchedKeys[bkey]) unmatched.push(backBases[bi]);
        }

        return { fronts: fronts, backsUnmatched: unmatched, total: fronts.length };
    }

    function scanSummaryText(scan, sharedBackFile) {
        var lines = [];
        lines.push("Fronts found: " + scan.total);
        var withBack = 0, missing = [];
        var i;
        for (i = 0; i < scan.fronts.length; i++) {
            if (scan.fronts[i].hasOwnBack) withBack++;
            else missing.push(scan.fronts[i].base);
        }
        lines.push("Fronts with their own back file: " + withBack);
        lines.push("Fronts WITHOUT a back: " + missing.length +
            (missing.length ? (sharedBackFile ? " (will use shared back)" : " (will be blank white)") : ""));
        if (missing.length) {
            lines.push("  " + missing.slice(0, 12).join(", ") + (missing.length > 12 ? " ..." : ""));
        }
        if (scan.backsUnmatched.length) {
            lines.push("Back files with no matching front: " + scan.backsUnmatched.length);
            lines.push("  " + scan.backsUnmatched.slice(0, 12).join(", ") +
                (scan.backsUnmatched.length > 12 ? " ..." : ""));
        }
        return lines.join("\n");
    }

    // Exported for the rest of the script (assigned in main).
    var KS = {
        defaultSettings: defaultSettings,
        computeLayout: computeLayout,
        mirrorIndex: mirrorIndex,
        scanFolder: scanFolder,
        scanSummaryText: scanSummaryText,
        mmToPx: mmToPx, mmToPxRound: mmToPxRound, ptToPx: ptToPx,
        PAPER_PRESETS: PAPER_PRESETS, CARD_PRESETS: CARD_PRESETS,
        CUTMARK_STYLES: CUTMARK_STYLES, PLACEMENT_MODES: PLACEMENT_MODES
    };

    // main(KS) is invoked at the very end of the file (function declarations
    // are hoisted, so all sections below are available).

    // ======================================================================
    // SECTION 4 — Settings persistence (native, via custom options)
    // ======================================================================

    function sid(k) { return stringIDToTypeID(k); }

    function saveSettings(s) {
        try {
            var d = new ActionDescriptor();
            d.putString(sid("folder"), s.folder || "");
            d.putString(sid("sharedBack"), s.sharedBack || "");
            d.putInteger(sid("paperPreset"), s.paperPreset);
            d.putDouble(sid("paperW"), s.paperW);
            d.putDouble(sid("paperH"), s.paperH);
            d.putInteger(sid("cardPreset"), s.cardPreset);
            d.putDouble(sid("cardW"), s.cardW);
            d.putDouble(sid("cardH"), s.cardH);
            d.putDouble(sid("ppi"), s.ppi);
            d.putDouble(sid("margin"), s.margin);
            d.putDouble(sid("gutter"), s.gutter);
            d.putBoolean(sid("cutMarksOn"), s.cutMarksOn);
            d.putInteger(sid("cutMarksStyle"), s.cutMarksStyle);
            d.putInteger(sid("placement"), s.placement);
            d.putBoolean(sid("duplex"), s.duplex);
            d.putInteger(sid("duplexFlip"), s.duplexFlip);
            d.putDouble(sid("offX"), s.offX);
            d.putDouble(sid("offY"), s.offY);
            d.putBoolean(sid("bleedOn"), s.bleedOn);
            d.putDouble(sid("bleedMm"), s.bleedMm);
            d.putInteger(sid("layoutStyle"), s.layoutStyle);
            app.putCustomOptions(SETTINGS_KEY, d, true);
        } catch (e) { /* settings are best-effort */ }
    }

    function loadSettings() {
        var s = defaultSettings();
        try {
            var d = app.getCustomOptions(SETTINGS_KEY);
            if (d.hasKey(sid("folder"))) s.folder = d.getString(sid("folder"));
            if (d.hasKey(sid("sharedBack"))) s.sharedBack = d.getString(sid("sharedBack"));
            if (d.hasKey(sid("paperPreset"))) s.paperPreset = d.getInteger(sid("paperPreset"));
            if (d.hasKey(sid("paperW"))) s.paperW = d.getDouble(sid("paperW"));
            if (d.hasKey(sid("paperH"))) s.paperH = d.getDouble(sid("paperH"));
            if (d.hasKey(sid("cardPreset"))) s.cardPreset = d.getInteger(sid("cardPreset"));
            if (d.hasKey(sid("cardW"))) s.cardW = d.getDouble(sid("cardW"));
            if (d.hasKey(sid("cardH"))) s.cardH = d.getDouble(sid("cardH"));
            if (d.hasKey(sid("ppi"))) s.ppi = d.getDouble(sid("ppi"));
            if (d.hasKey(sid("margin"))) s.margin = d.getDouble(sid("margin"));
            if (d.hasKey(sid("gutter"))) s.gutter = d.getDouble(sid("gutter"));
            if (d.hasKey(sid("cutMarksOn"))) s.cutMarksOn = d.getBoolean(sid("cutMarksOn"));
            if (d.hasKey(sid("cutMarksStyle"))) s.cutMarksStyle = d.getInteger(sid("cutMarksStyle"));
            if (d.hasKey(sid("placement"))) s.placement = d.getInteger(sid("placement"));
            if (d.hasKey(sid("duplex"))) s.duplex = d.getBoolean(sid("duplex"));
            if (d.hasKey(sid("duplexFlip"))) s.duplexFlip = d.getInteger(sid("duplexFlip"));
            if (d.hasKey(sid("offX"))) s.offX = d.getDouble(sid("offX"));
            if (d.hasKey(sid("offY"))) s.offY = d.getDouble(sid("offY"));
            if (d.hasKey(sid("bleedOn"))) s.bleedOn = d.getBoolean(sid("bleedOn"));
            if (d.hasKey(sid("bleedMm"))) s.bleedMm = d.getDouble(sid("bleedMm"));
            if (d.hasKey(sid("layoutStyle"))) s.layoutStyle = d.getInteger(sid("layoutStyle"));
        } catch (e) { /* no saved settings yet */ }
        return s;
    }

    // ======================================================================
    // SECTION 5 — ScriptUI dialog
    // ======================================================================

    function resolvePaperDims(s) {
        var p = PAPER_PRESETS[s.paperPreset];
        if (p && p[0] !== "Custom") return { wMm: p[1], hMm: p[2] };
        return { wMm: s.paperW, hMm: s.paperH };
    }
    function resolveCardDims(s) {
        var c = CARD_PRESETS[s.cardPreset];
        if (c && c[0] !== "Custom") return { wMm: c[1], hMm: c[2] };
        return { wMm: s.cardW, hMm: s.cardH };
    }

    function num(text, fallback) {
        var v = parseFloat(text);
        return isNaN(v) ? fallback : v;
    }

    function showDialog(s) {
        var result = { action: null, settings: s };
        var chosenFolder = s.folder ? new Folder(s.folder) : null;
        var chosenBack = s.sharedBack ? new File(s.sharedBack) : null;

        var dlg = new Window("dialog", "Koda Sheets — Imposition");
        dlg.orientation = "column";
        dlg.alignChildren = "fill";
        dlg.preferredSize.width = 420;

        // --- Source folder ---
        var srcP = dlg.add("panel", undefined, "Source folder");
        srcP.orientation = "row"; srcP.alignChildren = "center"; srcP.margins = 12;
        var srcTxt = srcP.add("statictext", undefined,
            chosenFolder ? chosenFolder.fsName : "(none chosen)");
        srcTxt.characters = 38;
        var srcBtn = srcP.add("button", undefined, "Choose…");
        srcBtn.onClick = function () {
            var f = Folder.selectDialog("Choose the folder of card images");
            if (f) { chosenFolder = f; srcTxt.text = f.fsName; }
        };

        // --- Sheet & card ---
        var grid = dlg.add("panel", undefined, "Sheet & card");
        grid.orientation = "column"; grid.alignChildren = "left"; grid.margins = 12;

        function row(parent) {
            var r = parent.add("group"); r.orientation = "row";
            r.alignChildren = "center"; return r;
        }

        var r1 = row(grid);
        r1.add("statictext", undefined, "Paper:");
        var paperDd = r1.add("dropdownlist", undefined);
        var i;
        for (i = 0; i < PAPER_PRESETS.length; i++) paperDd.add("item", PAPER_PRESETS[i][0]);
        paperDd.selection = s.paperPreset;
        var paperW = r1.add("edittext", undefined, String(s.paperW)); paperW.characters = 5;
        r1.add("statictext", undefined, "x");
        var paperH = r1.add("edittext", undefined, String(s.paperH)); paperH.characters = 5;
        r1.add("statictext", undefined, "mm");

        var r2 = row(grid);
        r2.add("statictext", undefined, "Card: ");
        var cardDd = r2.add("dropdownlist", undefined);
        for (i = 0; i < CARD_PRESETS.length; i++) cardDd.add("item", CARD_PRESETS[i][0]);
        cardDd.selection = s.cardPreset;
        var cardW = r2.add("edittext", undefined, String(s.cardW)); cardW.characters = 5;
        r2.add("statictext", undefined, "x");
        var cardH = r2.add("edittext", undefined, String(s.cardH)); cardH.characters = 5;
        r2.add("statictext", undefined, "mm");

        var r3 = row(grid);
        r3.add("statictext", undefined, "PPI:");
        var ppiTxt = r3.add("edittext", undefined, String(s.ppi)); ppiTxt.characters = 6;
        r3.add("statictext", undefined, "  Margin:");
        var marginTxt = r3.add("edittext", undefined, String(s.margin)); marginTxt.characters = 4;
        r3.add("statictext", undefined, "mm  Gutter:");
        var gutterTxt = r3.add("edittext", undefined, String(s.gutter)); gutterTxt.characters = 4;
        r3.add("statictext", undefined, "mm");

        var r4 = row(grid);
        var bleedChk = r4.add("checkbox", undefined, "Images include bleed:");
        bleedChk.value = s.bleedOn;
        var bleedTxt = r4.add("edittext", undefined, String(s.bleedMm)); bleedTxt.characters = 5;
        r4.add("statictext", undefined, "mm per edge (1/8\" = 3.175)");
        bleedChk.onClick = function () { bleedTxt.enabled = bleedChk.value; };
        bleedTxt.enabled = bleedChk.value;

        function syncCustom() {
            var pCustom = (PAPER_PRESETS[paperDd.selection.index][0] === "Custom");
            paperW.enabled = paperH.enabled = pCustom;
            var cCustom = (CARD_PRESETS[cardDd.selection.index][0] === "Custom");
            cardW.enabled = cardH.enabled = cCustom;
        }
        paperDd.onChange = syncCustom;
        cardDd.onChange = syncCustom;
        syncCustom();

        // --- Output options ---
        var outP = dlg.add("panel", undefined, "Output");
        outP.orientation = "column"; outP.alignChildren = "left"; outP.margins = 12;

        var o0 = row(outP);
        o0.add("statictext", undefined, "Layout: ");
        var layoutDd = o0.add("dropdownlist", undefined);
        for (i = 0; i < LAYOUT_STYLES.length; i++) layoutDd.add("item", LAYOUT_STYLES[i][0]);
        layoutDd.selection = s.layoutStyle;

        var o1 = row(outP);
        o1.add("statictext", undefined, "Placement:");
        var placeDd = o1.add("dropdownlist", undefined);
        for (i = 0; i < PLACEMENT_MODES.length; i++) placeDd.add("item", PLACEMENT_MODES[i]);
        placeDd.selection = s.placement;

        var o2 = row(outP);
        var cutChk = o2.add("checkbox", undefined, "Cut marks:");
        cutChk.value = s.cutMarksOn;
        var cutDd = o2.add("dropdownlist", undefined);
        for (i = 0; i < CUTMARK_STYLES.length; i++) cutDd.add("item", CUTMARK_STYLES[i]);
        cutDd.selection = s.cutMarksStyle;
        cutChk.onClick = function () { cutDd.enabled = cutChk.value; };
        cutDd.enabled = cutChk.value;

        var od = row(outP);
        var dupChk = od.add("checkbox", undefined, "Duplex back sheet(s).  Flip on:");
        dupChk.value = s.duplex;
        var flipDd = od.add("dropdownlist", undefined);
        for (i = 0; i < DUPLEX_FLIPS.length; i++) flipDd.add("item", DUPLEX_FLIPS[i]);
        flipDd.selection = s.duplexFlip;
        dupChk.onClick = function () { flipDd.enabled = dupChk.value; };
        flipDd.enabled = dupChk.value;

        var o3 = row(outP);
        o3.add("statictext", undefined, "Shared back (fallback):");
        var backTxt = o3.add("statictext", undefined,
            chosenBack ? decodeURI(chosenBack.name) : "(none)");
        backTxt.characters = 18;
        var backBtn = o3.add("button", undefined, "Pick…");
        var backClr = o3.add("button", undefined, "Clear");
        backBtn.onClick = function () {
            var f = File.openDialog("Choose a shared back image", "Images:*.png;*.jpg;*.jpeg");
            if (f) { chosenBack = f; backTxt.text = decodeURI(f.name); }
        };
        backClr.onClick = function () { chosenBack = null; backTxt.text = "(none)"; };

        var o4 = row(outP);
        o4.add("statictext", undefined, "Back calibration  X:");
        var offXTxt = o4.add("edittext", undefined, String(s.offX)); offXTxt.characters = 5;
        o4.add("statictext", undefined, "mm  Y:");
        var offYTxt = o4.add("edittext", undefined, String(s.offY)); offYTxt.characters = 5;
        o4.add("statictext", undefined, "mm");

        // --- Buttons ---
        var btns = dlg.add("group");
        btns.orientation = "row"; btns.alignment = "center";
        var scanBtn = btns.add("button", undefined, "Scan");
        var genBtn = btns.add("button", undefined, "Generate Sheets");
        var testBtn = btns.add("button", undefined, "Generate Test Sheet");
        var cancelBtn = btns.add("button", undefined, "Cancel");

        function collect() {
            var ns = {
                folder: chosenFolder ? chosenFolder.fsName : "",
                sharedBack: chosenBack ? chosenBack.fsName : "",
                paperPreset: paperDd.selection.index,
                paperW: num(paperW.text, s.paperW),
                paperH: num(paperH.text, s.paperH),
                cardPreset: cardDd.selection.index,
                cardW: num(cardW.text, s.cardW),
                cardH: num(cardH.text, s.cardH),
                ppi: num(ppiTxt.text, s.ppi),
                margin: num(marginTxt.text, s.margin),
                gutter: num(gutterTxt.text, s.gutter),
                cutMarksOn: cutChk.value,
                cutMarksStyle: cutDd.selection.index,
                placement: placeDd.selection.index,
                duplex: dupChk.value,
                duplexFlip: flipDd.selection.index,
                offX: num(offXTxt.text, s.offX),
                offY: num(offYTxt.text, s.offY),
                bleedOn: bleedChk.value,
                bleedMm: num(bleedTxt.text, s.bleedMm),
                layoutStyle: layoutDd.selection.index
            };
            return ns;
        }

        function validate(ns, needImages) {
            if (!ns.folder) { alert("Please choose a source folder."); return false; }
            var pd = resolvePaperDims(ns), cd = resolveCardDims(ns);
            if (pd.wMm <= 0 || pd.hMm <= 0) { alert("Paper size must be greater than 0."); return false; }
            if (cd.wMm <= 0 || cd.hMm <= 0) { alert("Card size must be greater than 0."); return false; }
            if (ns.ppi <= 0) { alert("PPI must be greater than 0."); return false; }
            if (ns.margin < 0 || ns.gutter < 0) { alert("Margin/gutter cannot be negative."); return false; }
            if (ns.bleedOn && ns.bleedMm < 0) { alert("Bleed cannot be negative."); return false; }
            return true;
        }

        scanBtn.onClick = function () {
            var ns = collect();
            if (!ns.folder) { alert("Please choose a source folder first."); return; }
            var sharedBackFile = ns.sharedBack ? new File(ns.sharedBack) : null;
            var scan = scanFolder(new Folder(ns.folder), sharedBackFile);
            if (scan.total === 0) { alert("No front images (.png/.jpg/.jpeg) found in that folder."); return; }
            var layout = makeLayout(ns).layout;
            var perSheet = layout.count;
            var sheets = perSheet > 0 ? Math.ceil(scan.total / perSheet) : 0;
            var msg = scanSummaryText(scan, sharedBackFile) + "\n\n" +
                "Cards per sheet: " + perSheet + " (" + layout.cols + " x " + layout.rows + ")" +
                (layout.rotated ? ", cards rotated" : "") + "\n" +
                "Sheets needed: " + sheets;
            if (!layout.fits) {
                msg += "\n\nWARNING: the chosen layout (" + LAYOUT_STYLES[ns.layoutStyle][0] +
                    ") does not fit on this paper at this card/bleed/margin size. " +
                    "Cards may run off the page. Try Auto, a smaller grid, or smaller margins.";
            }
            alert(msg);
        };

        genBtn.onClick = function () {
            var ns = collect();
            if (!validate(ns, true)) return;
            result.action = "generate"; result.settings = ns; dlg.close(1);
        };
        testBtn.onClick = function () {
            var ns = collect();
            if (!validate(ns, false)) return;
            result.action = "test"; result.settings = ns; dlg.close(1);
        };
        cancelBtn.onClick = function () { result.action = null; dlg.close(0); };

        dlg.show();
        return result;
    }

    // ======================================================================
    // SECTION 6 — Generation engine (Photoshop DOM)
    // ======================================================================

    function makeColor(r, g, b) {
        var c = new SolidColor();
        c.rgb.red = r; c.rgb.green = g; c.rgb.blue = b;
        return c;
    }

    function newDoc(name, wPx, hPx, ppi) {
        return app.documents.add(new UnitValue(wPx, "px"), new UnitValue(hPx, "px"),
            ppi, name, NewDocumentMode.RGB, DocumentFill.WHITE);
    }

    function boundsPx(layer) {
        var b = layer.bounds;
        return { left: b[0].as("px"), top: b[1].as("px"),
                 right: b[2].as("px"), bottom: b[3].as("px") };
    }

    // Place a file as a Smart Object on the active document (centered), return the layer.
    function placeFile(file) {
        var desc = new ActionDescriptor();
        desc.putPath(charIDToTypeID("null"), file);
        desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
        var off = new ActionDescriptor();
        off.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
        off.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
        desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), off);
        executeAction(charIDToTypeID("Plc "), desc, DialogModes.NO);
        return app.activeDocument.activeLayer;
    }

    // Place a card image into slot (px), shifted by (offX, offY). The art keeps
    // its aspect ratio (no stretching) and is rotated 90 deg when the slot's
    // orientation differs from the image's, so cards stay upright relative to
    // the layout. Scaled to fit the slot, then centered.
    function placeCard(doc, file, slot, offX, offY, asSmartObject, extraDeg) {
        var layer = placeFile(file);
        var b = boundsPx(layer);
        var curW = b.right - b.left, curH = b.bottom - b.top;
        if (curW <= 0 || curH <= 0) return layer;

        var targetW = Math.round(slot.wPx), targetH = Math.round(slot.hPx);

        // Match orientation: rotate art if slot is landscape but image is
        // portrait (or vice versa).
        var slotLandscape = targetW > targetH;
        var imgLandscape = curW > curH;
        if (slotLandscape !== imgLandscape) {
            layer.rotate(90, AnchorPosition.MIDDLECENTER);
            b = boundsPx(layer);
            curW = b.right - b.left; curH = b.bottom - b.top;
        }

        // Extra rotation for duplex backs (e.g. 180 deg on a short-edge flip).
        if (extraDeg) {
            layer.rotate(extraDeg, AnchorPosition.MIDDLECENTER);
            b = boundsPx(layer);
            curW = b.right - b.left; curH = b.bottom - b.top;
        }

        // Uniform scale to fit the slot (preserve aspect ratio — no stretch).
        var scale = Math.min(targetW / curW, targetH / curH) * 100;
        layer.resize(scale, scale, AnchorPosition.MIDDLECENTER);
        b = boundsPx(layer);

        // Center the (possibly letterboxed) art in the slot, plus calibration.
        var targetCx = Math.round(slot.xPx) + targetW / 2 + offX;
        var targetCy = Math.round(slot.yPx) + targetH / 2 + offY;
        var curCx = (b.left + b.right) / 2;
        var curCy = (b.top + b.bottom) / 2;
        layer.translate(targetCx - curCx, targetCy - curCy);

        if (!asSmartObject) layer.rasterize(RasterizeType.ENTIRELAYER);
        return layer;
    }

    function groupLayers(doc, layers, name) {
        if (!layers || layers.length === 0) return null;
        var set = doc.layerSets.add();
        set.name = name;
        var i;
        for (i = 0; i < layers.length; i++) {
            layers[i].move(set, ElementPlacement.INSIDE);
        }
        return set;
    }

    function fillRect(doc, l, t, r, b, color) {
        l = Math.round(l); t = Math.round(t); r = Math.round(r); b = Math.round(b);
        if (r <= l || b <= t) return;
        if (l < 0) l = 0; if (t < 0) t = 0;
        doc.selection.select([[l, t], [r, t], [r, b], [l, b]], SelectionType.REPLACE);
        doc.selection.fill(color);
        doc.selection.deselect();
    }

    function addText(doc, str, cx, cy, sizePx, color) {
        var t = doc.artLayers.add();
        t.kind = LayerKind.TEXT;
        var ti = t.textItem;
        ti.kind = TextType.POINTTEXT;
        ti.contents = str;
        ti.justification = Justification.CENTER;
        ti.size = new UnitValue(sizePx, "px");
        ti.color = color;
        ti.position = [new UnitValue(cx, "px"), new UnitValue(cy + sizePx * 0.35, "px")];
        return t;
    }

    function drawCutMarks(doc, layout, styleIndex, ppi, Wpx, Hpx, black, bleedPx) {
        bleedPx = bleedPx || 0;
        var sw = Math.max(1, Math.round(ptToPx(0.25, ppi)));
        // Build a single selection covering every mark shape. That selection
        // becomes the layer mask of an Invert adjustment layer, so the marks
        // invert whatever is beneath them instead of being flat black lines --
        // far easier to see against busy artwork. The adjustment layer is then
        // dropped to 30% opacity for a subtle effect.
        doc.selection.deselect();
        var sel = { active: false };
        if (CUTMARK_STYLES[styleIndex] === "Corner crop marks") {
            selectCornerMarks(doc, layout, ppi, sw, sel, bleedPx);
        } else {
            selectGutterGridlines(doc, layout, sw, Wpx, Hpx, sel, bleedPx);
        }
        if (!sel.active) return null;
        var layer = makeInvertAdjustmentLayer(doc);
        layer.name = "Cut Marks";
        layer.opacity = 30;
        doc.selection.deselect();
        return layer;
    }

    // Creates an Invert adjustment layer. When a selection is active, Photoshop
    // automatically uses it as the new layer's mask. Returns the created layer.
    function makeInvertAdjustmentLayer(doc) {
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putClass(charIDToTypeID("AdjL"));
        desc.putReference(charIDToTypeID("null"), ref);
        var using = new ActionDescriptor();
        using.putClass(charIDToTypeID("Type"), charIDToTypeID("Invr"));
        desc.putObject(charIDToTypeID("Usng"), charIDToTypeID("AdjL"), using);
        executeAction(charIDToTypeID("Mk  "), desc, DialogModes.NO);
        return doc.activeLayer;
    }

    // Adds a rectangle to the running mark selection, replacing on the first
    // shape and extending thereafter so all shapes accumulate into one mask.
    function selectRect(doc, l, t, r, b, sel) {
        l = Math.round(l); t = Math.round(t); r = Math.round(r); b = Math.round(b);
        if (r <= l || b <= t) return;
        if (l < 0) l = 0; if (t < 0) t = 0;
        var type = sel.active ? SelectionType.EXTEND : SelectionType.REPLACE;
        doc.selection.select([[l, t], [r, t], [r, b], [l, b]], type);
        sel.active = true;
    }

    function selectCornerMarks(doc, layout, ppi, sw, sel, bleedPx) {
        var markLen = mmToPxRound(3, ppi);
        var hs = Math.floor(sw / 2);
        var s, i;
        for (i = 0; i < layout.slots.length; i++) {
            s = layout.slots[i];
            // Marks sit at the trim line, inset from the (bleed-inclusive) slot.
            var cx = Math.round(s.xPx + bleedPx), cy = Math.round(s.yPx + bleedPx);
            var cr = Math.round(s.xPx + s.wPx - bleedPx), cb = Math.round(s.yPx + s.hPx - bleedPx);
            // Top-left
            selectRect(doc, cx - markLen, cy - hs, cx, cy - hs + sw, sel);
            selectRect(doc, cx - hs, cy - markLen, cx - hs + sw, cy, sel);
            // Top-right
            selectRect(doc, cr, cy - hs, cr + markLen, cy - hs + sw, sel);
            selectRect(doc, cr - hs, cy - markLen, cr - hs + sw, cy, sel);
            // Bottom-left
            selectRect(doc, cx - markLen, cb - hs, cx, cb - hs + sw, sel);
            selectRect(doc, cx - hs, cb, cx - hs + sw, cb + markLen, sel);
            // Bottom-right
            selectRect(doc, cr, cb - hs, cr + markLen, cb - hs + sw, sel);
            selectRect(doc, cr - hs, cb, cr - hs + sw, cb + markLen, sel);
        }
    }

    function selectGutterGridlines(doc, layout, sw, Wpx, Hpx, sel, bleedPx) {
        var cols = layout.cols, rows = layout.rows, slots = layout.slots;
        var c, r;
        for (c = 0; c < cols - 1; c++) {
            var leftCard = slots[c];
            var rightCard = slots[c + 1];
            // Trim edges: right card's left trim and left card's right trim.
            var gl = Math.round(leftCard.xPx + leftCard.wPx - bleedPx);
            var gr = Math.round(rightCard.xPx + bleedPx);
            selectRect(doc, gl, 0, gl + sw, Hpx, sel);
            selectRect(doc, gr - sw, 0, gr, Hpx, sel);
        }
        for (r = 0; r < rows - 1; r++) {
            var topCard = slots[r * cols];
            var botCard = slots[(r + 1) * cols];
            var gt = Math.round(topCard.yPx + topCard.hPx - bleedPx);
            var gb = Math.round(botCard.yPx + bleedPx);
            selectRect(doc, 0, gt, Wpx, gt + sw, sel);
            selectRect(doc, 0, gb - sw, Wpx, gb, sel);
        }
    }

    // ----- Layout builder (bleed-aware) -----

    // Returns everything geometry-related for a settings object. When bleed is
    // on, slots are arranged at the bleed-inclusive size (trim + bleed on every
    // edge) so images are never cropped; cut marks are drawn at the trim line,
    // inset from the slot by bleedPx.
    function makeLayout(s) {
        var pd = resolvePaperDims(s), cd = resolveCardDims(s);
        var bleedMm = s.bleedOn ? s.bleedMm : 0;
        var style = LAYOUT_STYLES[s.layoutStyle] || LAYOUT_STYLES[0];
        var layout = computeLayout({
            paperW: pd.wMm, paperH: pd.hMm,
            cardW: cd.wMm + 2 * bleedMm, cardH: cd.hMm + 2 * bleedMm,
            margin: s.margin, gutter: s.gutter, ppi: s.ppi,
            reserveGutterForMarks: s.cutMarksOn,
            forceCols: style[1], forceRows: style[2]
        });
        return {
            layout: layout, pd: pd, cd: cd, bleedMm: bleedMm,
            bleedPx: Math.round(mmToPx(bleedMm, s.ppi)),
            Wpx: mmToPxRound(pd.wMm, s.ppi),
            Hpx: mmToPxRound(pd.hMm, s.ppi)
        };
    }

    // ----- Full generation -----

    function generateSheets(s, scan) {
        var L = makeLayout(s);
        var layout = L.layout;
        if (layout.count === 0) throw new Error("No cards fit with the current settings.");
        if (!layout.fits) log("WARNING: forced layout " + LAYOUT_STYLES[s.layoutStyle][0] +
            " exceeds the printable area; cards may run off the page.");

        var Wpx = L.Wpx;
        var Hpx = L.Hpx;
        var bleedPx = L.bleedPx;
        var perSheet = layout.count;
        var total = scan.total;
        var sheets = Math.ceil(total / perSheet);
        var asSO = (PLACEMENT_MODES[s.placement] === "Smart Object");
        var black = makeColor(0, 0, 0);
        var offX = Math.round(mmToPx(s.offX, s.ppi));
        var offY = Math.round(mmToPx(s.offY, s.ppi));
        var shortEdge = (DUPLEX_FLIPS[s.duplexFlip] === "Short edge (top-bottom)");
        var backDeg = shortEdge ? 180 : 0;

        log("Layout: " + layout.cols + "x" + layout.rows + " = " + perSheet +
            " per sheet; total cards " + total + "; sheets " + sheets +
            "; doc " + Wpx + "x" + Hpx + "px @ " + s.ppi + "ppi");

        var sheet;
        for (sheet = 0; sheet < sheets; sheet++) {
            var base = sheet * perSheet;

            // ---- FRONT ----
            log("Front sheet " + (sheet + 1) + "/" + sheets);
            newDoc("Koda Front " + (sheet + 1), Wpx, Hpx, s.ppi);
            var fdoc = app.activeDocument;
            var fLayers = [];
            var slotI;
            for (slotI = 0; slotI < perSheet; slotI++) {
                var g = base + slotI;
                if (g >= total) break;
                var front = scan.fronts[g];
                fLayers.push(placeCard(fdoc, front.file, layout.slots[slotI], 0, 0, asSO));
            }
            groupLayers(fdoc, fLayers, "Front");
            if (s.cutMarksOn) drawCutMarks(fdoc, layout, s.cutMarksStyle, s.ppi, Wpx, Hpx, black, bleedPx);

            // ---- BACK ----
            if (s.duplex) {
                log("Back sheet " + (sheet + 1) + "/" + sheets);
                newDoc("Koda Back " + (sheet + 1), Wpx, Hpx, s.ppi);
                var bdoc = app.activeDocument;
                var bLayers = [];
                var p;
                for (p = 0; p < perSheet; p++) {
                    // Back slot p sits behind the front card mirrored per flip axis:
                    // long edge -> horizontal mirror; short edge -> vertical mirror.
                    var frontSlot = shortEdge
                        ? mirrorIndexV(p, layout.cols, layout.rows)
                        : mirrorIndex(p, layout.cols);
                    var gf = base + frontSlot;
                    if (gf >= total) continue;
                    var backFile = scan.fronts[gf].back;
                    if (!backFile) continue; // blank white back
                    bLayers.push(placeCard(bdoc, backFile, layout.slots[p], offX, offY, asSO, backDeg));
                }
                groupLayers(bdoc, bLayers, "Back");
                if (s.cutMarksOn) drawCutMarks(bdoc, layout, s.cutMarksStyle, s.ppi, Wpx, Hpx, black, bleedPx);
            }
        }
        return { sheets: sheets, perSheet: perSheet, total: total, layout: layout };
    }

    // ----- Test reference sheet -----

    function generateTestSheet(s) {
        var L = makeLayout(s);
        var layout = L.layout;
        if (layout.count === 0) throw new Error("No cards fit with the current settings.");

        var Wpx = L.Wpx;
        var Hpx = L.Hpx;
        var bleedPx = L.bleedPx;
        var black = makeColor(0, 0, 0), white = makeColor(255, 255, 255);
        var offX = Math.round(mmToPx(s.offX, s.ppi));
        var offY = Math.round(mmToPx(s.offY, s.ppi));
        var bw = Math.max(1, mmToPxRound(1.5, s.ppi));
        var shortEdge = (DUPLEX_FLIPS[s.duplexFlip] === "Short edge (top-bottom)");
        var backDeg = shortEdge ? 180 : 0;

        // isBack: lays out the duplex back exactly like generateSheets so that,
        // after the chosen flip, F# lands on the matching B#. The back label at a
        // slot is the FRONT card number it backs (mirrored), rotated for the flip.
        function drawSide(name, isBack) {
            newDoc(name, Wpx, Hpx, s.ppi);
            var doc = app.activeDocument;
            var baseLayer = doc.artLayers.add();
            baseLayer.name = "Placeholders";
            var ox = isBack ? offX : 0, oy = isBack ? offY : 0;
            var i;
            for (i = 0; i < layout.slots.length; i++) {
                var slot = layout.slots[i];
                var x = Math.round(slot.xPx) + ox, y = Math.round(slot.yPx) + oy;
                var w = Math.round(slot.wPx), h = Math.round(slot.hPx);
                doc.activeLayer = baseLayer;
                fillRect(doc, x, y, x + w, y + h, black);
                fillRect(doc, x + bw, y + bw, x + w - bw, y + h - bw, white);
                var label;
                if (!isBack) {
                    label = "F" + (i + 1);
                } else {
                    var frontSlot = shortEdge
                        ? mirrorIndexV(i, layout.cols, layout.rows)
                        : mirrorIndex(i, layout.cols);
                    label = "B" + (frontSlot + 1);
                }
                var t = addText(doc, label, x + w / 2, y + h / 2, Math.round(h * 0.4), black);
                if (isBack && backDeg) t.rotate(backDeg, AnchorPosition.MIDDLECENTER);
            }
            if (s.cutMarksOn) drawCutMarks(doc, layout, s.cutMarksStyle, s.ppi, Wpx, Hpx, black, bleedPx);
        }

        log("Test sheet: " + layout.cols + "x" + layout.rows + " = " + layout.count +
            " slots; flip " + DUPLEX_FLIPS[s.duplexFlip]);
        drawSide("Koda Test Front", false);
        drawSide("Koda Test Back", true);
        return { layout: layout };
    }

    // ======================================================================
    // SECTION 7 — Main / orchestration
    // ======================================================================

    function writeLog() {
        try {
            var f = new File(Folder.desktop + "/KodaSheets-log.txt");
            f.encoding = "UTF-8";
            f.open("w");
            f.write("=== Koda Sheets log ===\n" + LOG.join("\n") + "\n");
            f.close();
            return f.fsName;
        } catch (e) { return ""; }
    }

    function main(api) {
        // Re-expose ported helpers used by sections below.
        // (Functions are hoisted, so direct calls work; api is for clarity.)

        if (typeof app === "undefined") { return; }

        var s = loadSettings();
        var res = showDialog(s);
        if (!res.action) return; // cancelled

        s = res.settings;
        saveSettings(s);

        // Save and set units for predictable geometry.
        var savedRuler = app.preferences.rulerUnits;
        var savedType = app.preferences.typeUnits;
        var savedDialogs = app.displayDialogs;
        app.preferences.rulerUnits = Units.PIXELS;
        app.preferences.typeUnits = TypeUnits.PIXELS;
        app.displayDialogs = DialogModes.NO;

        var logPath = "";
        try {
            if (res.action === "generate") {
                var sharedBackFile = s.sharedBack ? new File(s.sharedBack) : null;
                var scan = scanFolder(new Folder(s.folder), sharedBackFile);
                if (scan.total === 0) throw new Error("No front images found in the chosen folder.");
                var gr = generateSheets(s, scan);

                var miss = 0, k;
                for (k = 0; k < scan.fronts.length; k++) if (!scan.fronts[k].hasOwnBack) miss++;
                logPath = writeLog();
                alert("Done.\n\nCards: " + gr.total +
                    "\nPer sheet: " + gr.perSheet + " (" + gr.layout.cols + " x " + gr.layout.rows + ")" +
                    "\nSheets generated: " + gr.sheets + (s.duplex ? " front + " + gr.sheets + " back" : " (front only)") +
                    "\nFronts without own back: " + miss +
                    (logPath ? ("\n\nLog: " + logPath) : ""));
            } else if (res.action === "test") {
                generateTestSheet(s);
                logPath = writeLog();
                alert("Test reference sheets created (front + back).\n" +
                    "Print duplex, flip on the long edge, and check F# aligns with B#." +
                    (logPath ? ("\n\nLog: " + logPath) : ""));
            }
        } catch (e) {
            log("ERROR: " + e.message + (e.line ? (" (line " + e.line + ")") : ""));
            logPath = writeLog();
            alert("Koda Sheets error:\n" + e.message +
                (e.line ? ("\nLine " + e.line) : "") +
                (logPath ? ("\n\nLog: " + logPath) : ""));
        } finally {
            app.preferences.rulerUnits = savedRuler;
            app.preferences.typeUnits = savedType;
            app.displayDialogs = savedDialogs;
        }
    }

    // Entry point — run everything. Function declarations above are hoisted,
    // so all sections are available regardless of source order.
    main(KS);

})();
