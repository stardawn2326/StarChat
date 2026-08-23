#target photoshop

(function () {
    var logFile = new File("C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/live2d/baoyin-b1/logs/photoshop-split-debug.txt");
    function log(s) {
        logFile.open("a");
        logFile.writeln(new Date().toString() + " | " + s);
        logFile.close();
    }
    var oldDialogs = app.displayDialogs;
    var stage = "start";
    var refDoc = null;
    var src = null;
    var proof = null;
    try {
        app.displayDialogs = DialogModes.NO;
        log("BEGIN");
        stage = "open";
        refDoc = app.open(new File("C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/character/白音-B1-Live2D三视图.png"));
        log("opened " + refDoc.width.as("px") + "x" + refDoc.height.as("px"));
        stage = "duplicate";
        src = refDoc.duplicate();
        refDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = src;
        stage = "crop";
        src.crop([new UnitValue(0, "px"), new UnitValue(0, "px"), new UnitValue(512, "px"), new UnitValue(1024, "px")]);
        log("cropped " + src.width.as("px") + "x" + src.height.as("px"));
        stage = "resize";
        src.resizeImage(null, new UnitValue(1024, "px"), 300, ResampleMethod.BICUBIC);
        log("resized " + src.width.as("px") + "x" + src.height.as("px"));
        stage = "deselect";
        src.selection.deselect();
        stage = "select_rectangle";
        src.selection.select([[10, 10], [500, 10], [500, 1000], [10, 1000]]);
        log("selected");
        stage = "copy";
        src.selection.copy();
        log("copied");
        stage = "new_doc";
        proof = app.documents.add(1024, 1024, 300, "photoshop-split-debug-proof", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
        stage = "paste";
        proof.paste();
        log("pasted layers=" + proof.layers.length);
        stage = "save";
        proof.saveAs(new File("C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/live2d/baoyin-b1/logs/photoshop-split-debug-proof.psd"), new PhotoshopSaveOptions(), true, Extension.LOWERCASE);
        log("SAVED");
    } catch (e) {
        log("ERROR stage=" + stage + " message=" + e.message + " number=" + e.number);
    }
    try { if (src) src.close(SaveOptions.DONOTSAVECHANGES); } catch (ignore1) {}
    try { app.displayDialogs = oldDialogs; } catch (ignore2) {}
    log("END");
})();
