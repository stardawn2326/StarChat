#target photoshop

(function () {
    var oldDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;

    var projectRoot = "C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/";
    var orthographicPath = projectRoot + "assets/character/白音-B1-Live2D三视图.png";
    var psdPath = projectRoot + "assets/live2d/baoyin-b1/source/baoyin-b1-front-split-v001-working.psd";
    var previewPath = projectRoot + "assets/live2d/baoyin-b1/qa/baoyin-b1-front-split-v001-visible-composite.png";

    function u(v) { return new UnitValue(v, "px"); }

    function addGroup(doc, name) {
        var group = doc.layerSets.add();
        group.name = name;
        return group;
    }

    function addRevealSelectionMask(doc) {
        var idMk = charIDToTypeID("Mk  ");
        var desc = new ActionDescriptor();
        var refNew = new ActionReference();
        refNew.putClass(charIDToTypeID("Chnl"));
        desc.putReference(charIDToTypeID("Nw  "), refNew);
        var refAt = new ActionReference();
        refAt.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
        desc.putReference(charIDToTypeID("At  "), refAt);
        desc.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
        executeAction(idMk, desc, DialogModes.NO);
    }

    function mapPoints(points, scale, offX, offY) {
        var out = [];
        for (var i = 0; i < points.length; i++) {
            out.push([offX + points[i][0] * scale, offY + points[i][1] * scale]);
        }
        return out;
    }

    function polygon(x1, y1, x2, y2) {
        return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }

    function pointBounds(points) {
        var minX = points[0][0], minY = points[0][1];
        var maxX = points[0][0], maxY = points[0][1];
        for (var i = 1; i < points.length; i++) {
            minX = Math.min(minX, points[i][0]);
            minY = Math.min(minY, points[i][1]);
            maxX = Math.max(maxX, points[i][0]);
            maxY = Math.max(maxY, points[i][1]);
        }
        return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
    }

    // Copy only the selected source region. Duplicating a full 4096x6144 layer
    // for every chunk stalls Photoshop and produces a misleading partial PSD.
    function pasteSourceChunk(src, doc, group, name, points, scale, offX, offY) {
        app.activeDocument = src;
        src.selection.deselect();
        src.selection.select(mapPoints(points, scale, 0, 0));
        src.selection.copy();

        app.activeDocument = doc;
        doc.paste();
        var layer = doc.activeLayer;
        var b = layer.bounds;
        var pb = pointBounds(points);
        var targetX = offX + pb.minX * scale;
        var targetY = offY + pb.minY * scale;
        layer.translate(u(targetX - b[0].as("px")), u(targetY - b[1].as("px")));
        layer.name = name;
        layer.move(group, ElementPlacement.INSIDE);
        layer.visible = true;
        doc.selection.deselect();
        return layer;
    }

    function addMarker(group, name) {
        var layer = group.artLayers.add();
        layer.name = name;
        layer.visible = false;
        return layer;
    }

    // Work on a duplicate immediately.  The authoritative orthographic sheet
    // must never be cropped, resized, or left with a live selection.
    var refDoc = app.open(new File(orthographicPath));
    var src = refDoc.duplicate();
    refDoc.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = src;

    // The left 512 px panel is the supplied front view. It is cropped only into
    // an intermediate source copy; the original orthographic sheet is retained.
    src.crop([u(0), u(0), u(512), u(1024)]);
    src.resizeImage(null, u(5529), 300, ResampleMethod.BICUBICSHARPER);
    var sourceW = src.width.as("px");
    var sourceH = src.height.as("px");
    var scale = sourceH / 1024;
    var offX = (4096 - sourceW) / 2;
    var offY = (6144 - sourceH) / 2;

    app.activeDocument = src;
    // Select the front figure with a deliberately conservative polygon. This
    // is only a working extraction: the pale background inside the silhouette
    // and every hidden overlap still require manual redraw in the formal PSD.
    // The polygon avoids Photoshop's asynchronous Select Subject operation,
    // which previously left the script suspended before any file was saved.
    var silhouette = [
        [256, 18], [222, 26], [190, 70], [170, 130], [150, 205],
        [112, 250], [84, 330], [72, 420], [82, 515], [100, 610],
        [118, 700], [108, 760], [132, 815], [148, 870], [185, 905],
        [198, 965], [228, 990], [270, 990], [292, 965], [306, 910],
        [336, 905], [374, 870], [392, 810], [430, 760], [448, 690],
        [458, 600], [472, 510], [462, 420], [450, 335], [424, 270],
        [390, 220], [372, 140], [350, 78], [320, 32]
    ];
    var doc = app.documents.add(4096, 6144, 300, "baoyin-b1-front-split-v001-working", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    // The source copy has already been resized from 1024 px to 5529 px high;
    // the base selection must use the same scale as the chunk selections.
    src.selection.select(mapPoints(silhouette, scale, 0, 0));
    src.selection.copy();
    app.activeDocument = doc;
    doc.paste();
    var base = doc.activeLayer;
    var silhouetteBounds = pointBounds(silhouette);
    var baseBounds = base.bounds;
    base.translate(
        u(offX + silhouetteBounds.minX * scale - baseBounds[0].as("px")),
        u(offY + silhouetteBounds.minY * scale - baseBounds[1].as("px"))
    );
    base.name = "SOURCE_FrontVisible_BACKGROUND_REVIEW";
    base.visible = false;

    var status = addGroup(doc, "__STATUS__");
    addMarker(status, "SPLIT_VISIBLE_PARTS_WORKING_NOT_FORMAL_PSD");
    addMarker(status, "PolygonPaste_ReviewEdges_ManualMaskRequired");
    addMarker(status, "HiddenRegions_NotYetRedrawn");

    var guide = addGroup(doc, "00_GUIDE");
    addMarker(guide, "Reference_Orthographic_Authoritative_FrontSideBack");
    addMarker(guide, "Reference_Main_Outfit");
    addMarker(guide, "Reference_AccessoryBreakdown");
    addMarker(guide, "Centerline");
    addMarker(guide, "SafeBoundary");

    var groups = {};
    var groupNames = [
        "01_FACE_BASE", "02_EYES_L", "03_EYES_R", "04_BROWS", "05_MOUTH",
        "06_HAIR_BACK", "07_HAIR_FRONT", "08_BODY", "09_BLOUSE", "10_WAISTCOAT",
        "11_CAPE", "12_SKIRT", "13_LEGS_STOCKINGS_SHOES", "14_ACCESSORIES", "15_EFFECT_OPTIONAL"
    ];
    for (var g = 0; g < groupNames.length; g++) groups[groupNames[g]] = addGroup(doc, groupNames[g]);

    // Coordinates are on the cropped 512x1024 front panel. They are intentionally
    // overlapping at seams so the visible composite stays intact while each major
    // garment/hair/body chunk can be moved for the first obstruction test.
    var chunks = [
        ["01_FACE_BASE", "Face_Base_VISIBLE_EXTRACTION", polygon(150, 90, 365, 255)],
        ["01_FACE_BASE", "Neck_VISIBLE_EXTRACTION", polygon(175, 205, 340, 300)],
        ["02_EYES_L", "EyeBlock_L_VISIBLE_EXTRACTION", polygon(178, 135, 255, 205)],
        ["03_EYES_R", "EyeBlock_R_VISIBLE_EXTRACTION", polygon(258, 135, 337, 205)],
        ["04_BROWS", "BrowArea_VISIBLE_EXTRACTION", polygon(175, 115, 340, 155)],
        ["05_MOUTH", "MouthArea_VISIBLE_EXTRACTION", polygon(205, 185, 310, 245)],
        ["06_HAIR_BACK", "BackHair_L_VISIBLE_EXTRACTION", polygon(45, 80, 220, 930)],
        ["06_HAIR_BACK", "BackHair_R_VISIBLE_EXTRACTION", polygon(300, 80, 475, 930)],
        ["07_HAIR_FRONT", "Bang_Center_VISIBLE_EXTRACTION", polygon(125, 20, 375, 160)],
        ["07_HAIR_FRONT", "SideLock_L_VISIBLE_EXTRACTION", polygon(95, 115, 190, 350)],
        ["07_HAIR_FRONT", "SideLock_R_VISIBLE_EXTRACTION", polygon(320, 115, 415, 350)],
        ["08_BODY", "ArmHand_L_VISIBLE_EXTRACTION", polygon(85, 295, 175, 525)],
        ["08_BODY", "ArmHand_R_VISIBLE_EXTRACTION", polygon(337, 295, 430, 525)],
        ["09_BLOUSE", "Blouse_Torso_VISIBLE_EXTRACTION", polygon(165, 220, 350, 370)],
        ["09_BLOUSE", "Sleeve_L_VISIBLE_EXTRACTION", polygon(105, 265, 230, 535)],
        ["09_BLOUSE", "Sleeve_R_VISIBLE_EXTRACTION", polygon(285, 265, 410, 535)],
        ["10_WAISTCOAT", "Waistcoat_Front_VISIBLE_EXTRACTION", polygon(140, 300, 365, 490)],
        ["11_CAPE", "Cape_L_VISIBLE_EXTRACTION", polygon(65, 205, 250, 410)],
        ["11_CAPE", "Cape_R_VISIBLE_EXTRACTION", polygon(265, 205, 455, 410)],
        ["12_SKIRT", "InnerSkirt_VISIBLE_EXTRACTION", polygon(120, 450, 355, 630)],
        ["12_SKIRT", "OuterPanel_L_VISIBLE_EXTRACTION", polygon(75, 390, 275, 635)],
        ["12_SKIRT", "LavenderLongSideDrape_R_VISIBLE_EXTRACTION", polygon(245, 380, 480, 925)],
        ["13_LEGS_STOCKINGS_SHOES", "Stocking_L_VISIBLE_EXTRACTION", polygon(145, 570, 255, 915)],
        ["13_LEGS_STOCKINGS_SHOES", "Stocking_R_VISIBLE_EXTRACTION", polygon(255, 570, 365, 915)],
        ["13_LEGS_STOCKINGS_SHOES", "Shoe_L_VISIBLE_EXTRACTION", polygon(125, 865, 260, 1005)],
        ["13_LEGS_STOCKINGS_SHOES", "Shoe_R_VISIBLE_EXTRACTION", polygon(250, 865, 390, 1005)],
        ["14_ACCESSORIES", "HairBow_Gem_Chain_L_VISIBLE_EXTRACTION", polygon(300, 65, 430, 230)],
        ["14_ACCESSORIES", "ShoulderBrooch_Chain_L_VISIBLE_EXTRACTION", polygon(120, 190, 240, 330)],
        ["14_ACCESSORIES", "ShoulderBrooch_Chain_R_VISIBLE_EXTRACTION", polygon(290, 190, 410, 330)],
        ["14_ACCESSORIES", "WaistMoonBuckle_Chain_VISIBLE_EXTRACTION", polygon(220, 320, 395, 515)]
    ];

    for (var i = 0; i < chunks.length; i++) {
        pasteSourceChunk(src, doc, groups[chunks[i][0]], chunks[i][1], chunks[i][2], scale, offX, offY);
    }

    var fineNames = [
        ["02_EYES_L", ["EyeWhite_L", "Iris_L", "Pupil_L", "Highlight_Main_L", "Highlight_Sub_L", "UpperLash_L", "LowerLash_L", "Eyelid_L", "EyeShadow_L"]],
        ["03_EYES_R", ["EyeWhite_R", "Iris_R", "Pupil_R", "Highlight_Main_R", "Highlight_Sub_R", "UpperLash_R", "LowerLash_R", "Eyelid_R", "EyeShadow_R"]],
        ["05_MOUTH", ["Mouth_Line_Upper", "Mouth_Line_Lower", "Mouth_Interior", "Teeth_Upper", "Teeth_Lower", "Tongue", "Lip_Shadow", "Mouth_Corner_L", "Mouth_Corner_R"]],
        ["14_ACCESSORIES", ["Rose_Petals_Group", "Rose_Leaves", "CentralGem_Base", "CentralGem", "CentralGem_Highlight", "SilverVine_L", "SilverVine_R", "CrystalDrop_01", "CrystalDrop_02", "CrystalDrop_03"]]
    ];
    for (var f = 0; f < fineNames.length; f++) {
        var fineGroup = groups[fineNames[f][0]];
        for (var n = 0; n < fineNames[f][1].length; n++) addMarker(fineGroup, fineNames[f][1][n] + "_NEEDS_MANUAL_OBJECT_SPLIT");
    }

    // Leave the source cutout hidden; visible chunks are the current split result.
    doc.activeLayer = base;
    doc.selection.deselect();
    doc.saveAs(new File(psdPath), new PhotoshopSaveOptions(), true, Extension.LOWERCASE);

    // Export a composite proof by duplicating and flattening the layered doc;
    // this avoids another copy-merged operation that can block Photoshop.
    var comp = doc.duplicate();
    comp.name = "baoyin-b1-front-split-v001-composite";
    app.activeDocument = comp;
    comp.flatten();
    var pngOptions = new PNGSaveOptions();
    comp.saveAs(new File(previewPath), pngOptions, true, Extension.LOWERCASE);
    comp.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    doc.selection.deselect();
    src.close(SaveOptions.DONOTSAVECHANGES);
    app.activeDocument = doc;
    app.displayDialogs = oldDialogs;
    alert("B1 front split working PSD saved. Major visible chunks were extracted from the authoritative orthographic front panel. Fine facial/accessory layers and hidden-region redraw remain explicitly marked for manual completion; this is not yet the formal commercial PSD.");
})();
