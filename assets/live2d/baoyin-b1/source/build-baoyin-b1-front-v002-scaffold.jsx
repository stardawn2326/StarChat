#target photoshop

(function () {
    var oldDialogs = app.displayDialogs;
    app.displayDialogs = DialogModes.NO;
    var psdPath = "C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/live2d/baoyin-b1/source/baoyin-b1-front-v002-redraw-scaffold.psd";
    var guidePath = "C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/character/白音-B1-Live2D三视图.png";

    var doc = app.documents.add(4096, 6144, 300, "baoyin-b1-front-v002-redraw-scaffold", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
    doc.bitsPerChannel = BitsPerChannelType.EIGHT;

    var statusGroup = doc.layerSets.add();
    statusGroup.name = "__STATUS__";
    var statusLayer = statusGroup.artLayers.add();
    statusLayer.name = "REDRAW_PENDING_NOT_DELIVERABLE";
    statusLayer.visible = false;

    var groups = [
        ["00_GUIDE", ["ColorPalette", "Reference_Main", "Reference_Orthographic_Authoritative", "Reference_Expressions", "Reference_Poses", "Reference_AccessoryBreakdown", "Reference_HistoricalCalibration_v003_v004", "Centerline", "SafeBoundary"]],
        ["01_FACE_BASE", ["Face_Base", "Ear_L", "Ear_R", "Nose", "Blush_L", "Blush_R", "Face_Shadow", "Neck"]],
        ["02_EYES_L", ["EyeWhite_L", "Iris_L", "Pupil_L", "Highlight_Main_L", "Highlight_Sub_L", "UpperLash_L", "LowerLash_L", "Eyelid_L", "EyeShadow_L"]],
        ["03_EYES_R", ["EyeWhite_R", "Iris_R", "Pupil_R", "Highlight_Main_R", "Highlight_Sub_R", "UpperLash_R", "LowerLash_R", "Eyelid_R", "EyeShadow_R"]],
        ["04_BROWS", ["Brow_L", "Brow_R"]],
        ["05_MOUTH", ["Mouth_Line_Upper", "Mouth_Line_Lower", "Mouth_Interior", "Teeth_Upper", "Teeth_Lower", "Tongue", "Lip_Shadow", "Mouth_Corner_L", "Mouth_Corner_R", "Mouth_A", "Mouth_I", "Mouth_U", "Mouth_E", "Mouth_O"]],
        ["06_HAIR_BACK", ["BackHair_Base", "BackHair_L_Inner", "BackHair_L_Outer", "BackHair_R_Inner", "BackHair_R_Outer", "BackHair_Center", "LongStrand_L_01", "LongStrand_L_02", "LongStrand_L_03", "LongStrand_R_01", "LongStrand_R_02", "LongStrand_R_03", "Hair_Shadow_Back"]],
        ["07_HAIR_FRONT", ["Bang_Center", "Bang_L_01", "Bang_L_02", "Bang_L_03", "Bang_R_01", "Bang_R_02", "Bang_R_03", "SideLock_L", "SideLock_R", "Ahoge", "Hair_Highlight", "Hair_Shadow_Front"]],
        ["08_BODY", ["Torso_Base", "Arm_L_Upper", "Arm_L_Lower", "Arm_R_Upper", "Arm_R_Lower", "Hand_L", "Hand_R", "Finger_L_01", "Finger_L_02", "Finger_R_01", "Finger_R_02", "Leg_L", "Leg_R"]],
        ["09_BLOUSE", ["Blouse_Torso", "Collar_L", "Collar_R", "Front_Pleats", "Sleeve_L_Upper", "Sleeve_L_Lower", "Sleeve_R_Upper", "Sleeve_R_Lower", "Cuff_L", "Cuff_R"]],
        ["10_WAISTCOAT", ["Waistcoat_Front_L", "Waistcoat_Front_R", "Waistcoat_Side_L", "Waistcoat_Side_R", "Waistcoat_Lacing", "Waistcoat_Trim", "Waistcoat_Shadow"]],
        ["11_CAPE", ["Cape_Base_L", "Cape_Base_R", "Cape_Lace_L", "Cape_Lace_R", "Cape_Embroidery", "Cape_Clasp", "Cape_Shadow"]],
        ["12_SKIRT", ["InnerLining", "InnerSkirt", "OuterPanel_L", "OuterPanel_R", "OuterPanel_Center", "LavenderSideDrape_L_01", "LavenderSideDrape_L_02", "LavenderSideDrape_R_01", "LavenderSideDrape_R_02", "DrapeEmbroidery_L", "DrapeEmbroidery_R", "HemShadow"]],
        ["13_LEGS_STOCKINGS_SHOES", ["Leg_L", "Leg_R", "Stocking_L", "Stocking_R", "LaceTop_L", "LaceTop_R", "Bow_L", "Bow_R", "Shoe_L", "Shoe_R", "ShoeBuckle_L", "ShoeBuckle_R"]],
        ["14_ACCESSORIES", ["HairBow_Base", "HairBow_Tail_01", "HairBow_Tail_02", "HairComb", "Rose_Petals_Group", "Rose_Leaves", "CentralGem_Base", "CentralGem", "CentralGem_Highlight", "WaistMoonBuckle", "Chain_Segment_L_01", "Chain_Segment_L_02", "Chain_Segment_R_01", "Chain_Segment_R_02", "CrystalDrop_01", "CrystalDrop_02", "CrystalDrop_03", "ShoulderBrooch"]],
        ["15_EFFECT_OPTIONAL", ["Blush_Strong", "Tear_L", "Tear_R", "SweatDrop", "AngerMark", "ConfusionMark"]]
    ];

    for (var i = groups.length - 1; i >= 0; i--) {
        var group = doc.layerSets.add();
        group.name = groups[i][0];
        var names = groups[i][1];
        for (var j = names.length - 1; j >= 0; j--) {
            var layer = group.artLayers.add();
            layer.name = names[j];
            layer.visible = false;
        }
        if (group.name === "00_GUIDE") {
            group.visible = false;
        }
    }

    var guideFile = new File(guidePath);
    if (guideFile.exists) {
        var guideDoc = app.open(guideFile);
        guideDoc.selection.selectAll();
        guideDoc.selection.copy();
        app.activeDocument = doc;
        doc.paste();
        var pasted = doc.activeLayer;
        pasted.name = "Reference_Orthographic_Authoritative_FrontSideBack";
        var guideGroup = doc.layerSets.getByName("00_GUIDE");
        pasted.move(guideGroup, ElementPlacement.INSIDE);
        pasted.visible = false;
        guideDoc.close(SaveOptions.DONOTSAVECHANGES);
    }

    var saveFile = new File(psdPath);
    doc.saveAs(saveFile, new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
    app.activeDocument = doc;
    app.displayDialogs = oldDialogs;
    alert("B1 v002 redraw scaffold saved. Canvas: 4096x6144. Guide: authoritative orthographic front/side/back sheet. All object layers are intentionally empty and marked not deliverable until redrawn.");
})();
