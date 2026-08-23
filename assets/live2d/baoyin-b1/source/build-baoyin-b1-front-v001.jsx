/*
  White-tone B1 formal artwork builder.
  Runs inside Photoshop through File > Scripts > Browse.
  It creates independently authored transparent SVG components, imports and
  rasterizes them into named PSD layers, and saves only inside Project-008.
*/
#target photoshop

var ROOT = "C:/Users/23260/Desktop/Workspace/projects/Project-008-白音AI助手/assets/live2d/baoyin-b1";
var SVG_DIR = ROOT + "/source/svg";
var SOURCE_DIR = ROOT + "/source";
var QA_DIR = ROOT + "/qa";
var FORMAL_PSD = SOURCE_DIR + "/baoyin-b1-front-v001.psd";
var WORKING_PSD = SOURCE_DIR + "/baoyin-b1-front-v001-working.psd";
var COMPOSITE_PNG = QA_DIR + "/baoyin-b1-front-v001-static-composite.png";
var W = 4096;
var H = 6144;

function ensureFolder(path) {
  var f = new Folder(path);
  if (!f.exists) f.create();
  return f;
}

ensureFolder(SVG_DIR);
ensureFolder(SOURCE_DIR);
ensureFolder(QA_DIR);

var defs = ''
  + '<defs>'
  + '<linearGradient id="hair" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.55" stop-color="#eeeaff"/><stop offset="1" stop-color="#b9b3d5"/></linearGradient>'
  + '<linearGradient id="hair2" x1="0" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#fffaff"/><stop offset="0.7" stop-color="#dcd7f0"/><stop offset="1" stop-color="#aaa4c8"/></linearGradient>'
  + '<linearGradient id="skin" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff1ef"/><stop offset="0.65" stop-color="#f3cfd0"/><stop offset="1" stop-color="#d898a9"/></linearGradient>'
  + '<linearGradient id="black" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#55566e"/><stop offset="0.45" stop-color="#292a3d"/><stop offset="1" stop-color="#181927"/></linearGradient>'
  + '<linearGradient id="lav" x1="0" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#eee5ff" stop-opacity="0.9"/><stop offset="0.55" stop-color="#baa0e4" stop-opacity="0.92"/><stop offset="1" stop-color="#765caa" stop-opacity="0.95"/></linearGradient>'
  + '<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d5ff"/><stop offset="0.35" stop-color="#a98aff"/><stop offset="0.8" stop-color="#6332ad"/><stop offset="1" stop-color="#321b70"/></linearGradient>'
  + '<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#cfc9df"/><stop offset="1" stop-color="#8d88a8"/></linearGradient>'
  + '<pattern id="stars" width="220" height="220" patternUnits="userSpaceOnUse"><path d="M110 26 L128 92 L194 110 L128 128 L110 194 L92 128 L26 110 L92 92 Z" fill="#e8ddff" opacity="0.72"/></pattern>'
  + '</defs>';

function svg(body) {
  return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' + defs + body + '</svg>';
}

function writeSvg(name, body) {
  var f = new File(SVG_DIR + "/" + name + ".svg");
  f.encoding = "UTF8";
  f.open("w");
  f.write(svg(body));
  f.close();
}

function placeSvg(name, targetGroup) {
  var f = new File(SVG_DIR + "/" + name + ".svg");
  var d = new ActionDescriptor();
  d.putPath(charIDToTypeID("null"), f);
  d.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  var o = new ActionDescriptor();
  o.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  o.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  d.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), o);
  executeAction(charIDToTypeID("Plc "), d, DialogModes.NO);
  var layer = app.activeDocument.activeLayer;
  layer.name = name;
  try { layer.rasterize(RasterizeType.ENTIRELAYER); } catch (e) {}
  try { layer.move(targetGroup, ElementPlacement.INSIDE); } catch (e2) {}
  return layer;
}

function addEmpty(targetGroup, name, visible) {
  var layer = targetGroup.artLayers.add();
  layer.name = name;
  layer.visible = visible !== false;
  return layer;
}

function addTextNote(doc, text) {
  var g = doc.layerSets.add();
  g.name = "_PRODUCTION_NOTE_README";
  var l = g.artLayers.add();
  l.name = text;
  l.visible = false;
  return g;
}

/* Back hair: complete silhouette behind all clothing. */
writeSvg("BackHair_Base", ''
  + '<path d="M2048 360 C1680 280 1390 610 1430 1170 C1250 1600 1160 2310 1040 2910 C930 3450 820 4010 990 4410 C1180 4560 1370 4250 1510 3890 L1680 3290 L2048 3100 L2416 3290 L2586 3890 C2726 4250 2916 4560 3106 4410 C3276 4010 3166 3450 3056 2910 C2936 2310 2846 1600 2666 1170 C2706 610 2416 280 2048 360 Z" fill="url(#hair)" stroke="#8d88a8" stroke-width="26"/>'
  + '<path d="M1710 640 C1430 1200 1510 2420 1250 3760" fill="none" stroke="#b4acd0" stroke-width="42" opacity="0.78"/>'
  + '<path d="M1840 520 C1640 1250 1730 2440 1460 4050" fill="none" stroke="#ffffff" stroke-width="44" opacity="0.82"/>'
  + '<path d="M2380 520 C2580 1250 2490 2440 2760 4050" fill="none" stroke="#ffffff" stroke-width="44" opacity="0.82"/>'
  + '<path d="M2520 700 C2790 1300 2590 2540 2910 3760" fill="none" stroke="#a9a1c8" stroke-width="42" opacity="0.76"/>'
  + '<path d="M1530 1650 C1300 2380 1210 3140 1120 3900" fill="none" stroke="#8e87ae" stroke-width="28" opacity="0.72"/>'
  + '<path d="M2566 1650 C2796 2380 2886 3140 2976 3900" fill="none" stroke="#8e87ae" stroke-width="28" opacity="0.72"/>');

/* Skin base contains full torso, arms, hands and legs under the clothes. */
writeSvg("Body_Torso", ''
  + '<path d="M1770 1800 C1800 1630 1900 1540 2048 1540 C2196 1540 2296 1630 2326 1800 L2440 2940 C2310 3150 1786 3150 1656 2940 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="22"/>'
  + '<path d="M1900 1570 L1900 1970 M2196 1570 L2196 1970" stroke="#d799a9" stroke-width="22"/>'
  + '<path d="M1850 1830 C1950 1880 2146 1880 2246 1830" fill="none" stroke="#fff7f6" stroke-width="26" opacity="0.8"/>');

writeSvg("Arms_Hands", ''
  + '<path d="M1660 1930 C1480 2000 1340 2200 1260 2470 L1160 3010 C1130 3140 1180 3270 1290 3300 C1410 3330 1480 3220 1500 3090 L1570 2670 L1780 2320 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="24"/>'
  + '<path d="M2436 1930 C2616 2000 2756 2200 2836 2470 L2936 3010 C2966 3140 2916 3270 2806 3300 C2686 3330 2616 3220 2596 3090 L2526 2670 L2316 2320 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="24"/>'
  + '<path d="M1160 3010 C1080 3130 1090 3300 1210 3370 C1280 3410 1340 3380 1370 3300 L1320 3190 L1390 3290 L1440 3250 L1370 3120 L1470 3230 L1510 3160 L1420 3020 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="20"/>'
  + '<path d="M2936 3010 C3016 3130 3006 3300 2886 3370 C2816 3410 2756 3380 2726 3300 L2776 3190 L2706 3290 L2656 3250 L2726 3120 L2626 3230 L2586 3160 L2676 3020 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="20"/>'
  + '<path d="M1215 3170 L1320 3200 M1250 3100 L1360 3150 M2880 3170 L2775 3200 M2845 3100 L2735 3150" stroke="#bd7e92" stroke-width="16"/>');

writeSvg("Legs", ''
  + '<path d="M1700 3220 C1660 3650 1650 4140 1700 4690 L1770 5460 C1785 5580 1870 5650 1980 5630 C2080 5610 2115 5520 2100 5410 L2040 4600 L2080 3420 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="24"/>'
  + '<path d="M2396 3220 C2436 3650 2446 4140 2396 4690 L2326 5460 C2311 5580 2226 5650 2116 5630 C2016 5610 1981 5520 1996 5410 L2056 4600 L2016 3420 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="24"/>'
  + '<path d="M1780 4020 C1860 4070 1980 4070 2050 4020 M2320 4020 C2240 4070 2120 4070 2050 4020" fill="none" stroke="#fff0ef" stroke-width="24" opacity="0.7"/>');

writeSvg("Blouse_Torso", ''
  + '<path d="M1760 1810 C1850 1730 1950 1700 2048 1700 C2146 1700 2246 1730 2336 1810 L2440 2860 L2320 3030 L1776 3030 L1656 2860 Z" fill="#fffaff" stroke="#aaa4c2" stroke-width="22"/>'
  + '<path d="M1860 1790 L2048 2050 L2236 1790 L2200 2930 L1896 2930 Z" fill="#faf6ff" stroke="#c9c0de" stroke-width="18"/>'
  + '<path d="M2048 2010 L2048 2890" stroke="#9f97b9" stroke-width="18"/>'
  + '<g fill="#b3a7c8"><circle cx="2048" cy="2190" r="22"/><circle cx="2048" cy="2390" r="22"/><circle cx="2048" cy="2590" r="22"/><circle cx="2048" cy="2790" r="22"/></g>'
  + '<path d="M1860 1810 C1900 1890 1960 1960 2048 2030 C2136 1960 2196 1890 2236 1810" fill="none" stroke="#b6abc9" stroke-width="24"/>'
  + '<path d="M1875 2110 L1875 2860 M1940 2110 L1940 2860 M2156 2110 L2156 2860 M2221 2110 L2221 2860" stroke="#e2dcef" stroke-width="18"/>');

writeSvg("Sleeve_L", ''
  + '<path d="M1660 1900 C1450 1960 1300 2150 1280 2450 C1260 2720 1320 2960 1470 3080 L1650 3000 C1700 2790 1730 2530 1780 2260 Z" fill="url(#lav)" stroke="#8f83af" stroke-width="24"/>'
  + '<path d="M1340 2210 C1440 2290 1570 2320 1710 2260 M1310 2440 C1420 2510 1550 2550 1680 2500 M1300 2670 C1410 2740 1510 2780 1650 2730" fill="none" stroke="#e9ddff" stroke-width="24" opacity="0.85"/>'
  + '<path d="M1450 3010 C1510 2940 1620 2940 1680 3010 L1670 3180 C1600 3250 1500 3250 1430 3180 Z" fill="#fffaff" stroke="#aaa4c2" stroke-width="22"/>'
  + '<path d="M1440 3150 L1670 3150" stroke="#9c91b6" stroke-width="20"/>');

writeSvg("Sleeve_R", ''
  + '<path d="M2436 1900 C2646 1960 2796 2150 2816 2450 C2836 2720 2776 2960 2626 3080 L2446 3000 C2396 2790 2366 2530 2316 2260 Z" fill="url(#lav)" stroke="#8f83af" stroke-width="24"/>'
  + '<path d="M2756 2210 C2656 2290 2526 2320 2386 2260 M2786 2440 C2676 2510 2546 2550 2416 2500 M2796 2670 C2686 2740 2586 2780 2446 2730" fill="none" stroke="#e9ddff" stroke-width="24" opacity="0.85"/>'
  + '<path d="M2646 3010 C2586 2940 2476 2940 2416 3010 L2426 3180 C2496 3250 2596 3250 2666 3180 Z" fill="#fffaff" stroke="#aaa4c2" stroke-width="22"/>'
  + '<path d="M2656 3150 L2426 3150" stroke="#9c91b6" stroke-width="20"/>');

writeSvg("Waistcoat", ''
  + '<path d="M1660 2550 C1780 2460 1890 2440 2048 2480 C2206 2440 2316 2460 2436 2550 L2510 3280 L2300 3460 L2048 3320 L1796 3460 L1586 3280 Z" fill="url(#black)" stroke="#171827" stroke-width="30"/>'
  + '<path d="M1660 2550 L1930 2630 L2048 2480 L2166 2630 L2436 2550" fill="none" stroke="#e8dfff" stroke-width="28"/>'
  + '<path d="M1880 2680 L1810 3230 M2216 2680 L2286 3230" stroke="#7d7897" stroke-width="26"/>'
  + '<path d="M1810 3240 C1950 3310 2146 3310 2286 3240" fill="none" stroke="#aaa3c4" stroke-width="26"/>'
  + '<path d="M1950 2780 L2048 2690 L2146 2780" fill="none" stroke="#e8dfff" stroke-width="22"/>'
  + '<path d="M1960 2860 L2136 2860 M1940 2960 L2156 2960 M1920 3060 L2176 3060" stroke="#a99fc1" stroke-width="18"/>');

writeSvg("Cape_L", ''
  + '<path d="M1720 1890 C1500 1820 1320 1930 1160 2110 C1080 2220 1020 2380 1010 2580 L1510 2840 L1780 2420 Z" fill="url(#black)" stroke="#171827" stroke-width="28"/>'
  + '<path d="M1060 2520 C1220 2590 1390 2660 1540 2760" fill="none" stroke="#e8dfff" stroke-width="24"/>'
  + '<path d="M1110 2360 C1250 2440 1400 2490 1560 2540" fill="none" stroke="#a99fc1" stroke-width="18"/>'
  + '<path d="M1060 2520 L1120 2670 L1180 2590 L1250 2750 L1320 2660 L1410 2810 L1490 2710" fill="none" stroke="#e7dbff" stroke-width="22"/>'
  + '<path d="M1020 2570 C1140 2700 1330 2830 1510 2870" fill="none" stroke="#171827" stroke-width="44" stroke-dasharray="14 22"/>');

writeSvg("Cape_R", ''
  + '<path d="M2376 1890 C2596 1820 2776 1930 2936 2110 C3016 2220 3076 2380 3086 2580 L2586 2840 L2316 2420 Z" fill="url(#black)" stroke="#171827" stroke-width="28"/>'
  + '<path d="M3036 2520 C2876 2590 2706 2660 2556 2760" fill="none" stroke="#e8dfff" stroke-width="24"/>'
  + '<path d="M2986 2360 C2846 2440 2696 2490 2536 2540" fill="none" stroke="#a99fc1" stroke-width="18"/>'
  + '<path d="M3036 2520 L2976 2670 L2916 2590 L2846 2750 L2776 2660 L2686 2810 L2606 2710" fill="none" stroke="#e7dbff" stroke-width="22"/>'
  + '<path d="M3076 2570 C2956 2700 2766 2830 2586 2870" fill="none" stroke="#171827" stroke-width="44" stroke-dasharray="14 22"/>');

writeSvg("Skirt_Outer", ''
  + '<path d="M1580 3200 C1760 3270 1900 3300 2048 3300 C2196 3300 2336 3270 2516 3200 L2890 3910 L2510 4200 L2048 4050 L1586 4200 L1206 3910 Z" fill="url(#black)" stroke="#171827" stroke-width="30"/>'
  + '<path d="M1580 3200 L1900 3350 L2048 3300 L2196 3350 L2516 3200" fill="none" stroke="#e8dfff" stroke-width="28"/>'
  + '<path d="M1390 3880 C1620 3970 1800 4030 2048 4050 C2296 4030 2476 3970 2706 3880" fill="none" stroke="#bdb3d5" stroke-width="28"/>'
  + '<path d="M1500 3460 L1680 3880 M1730 3380 L1830 3990 M2396 3380 L2296 3990 M2596 3460 L2416 3880" stroke="#666680" stroke-width="22" opacity="0.8"/>'
  + '<path d="M1450 3590 L2646 3590 L2720 3810 L1376 3810 Z" fill="url(#stars)" opacity="0.35"/>');

writeSvg("Skirt_Lavender", ''
  + '<path d="M2360 3260 C2520 3290 2650 3390 2760 3540 L3160 4550 L2860 4820 L2580 4450 L2350 3880 Z" fill="url(#lav)" stroke="#8e83af" stroke-width="28"/>'
  + '<path d="M1736 3260 C1576 3290 1446 3390 1336 3540 L936 4550 L1236 4820 L1516 4450 L1746 3880 Z" fill="url(#lav)" stroke="#8e83af" stroke-width="28"/>'
  + '<path d="M2390 3410 C2610 3750 2740 4200 2960 4580 M1706 3410 C1486 3750 1356 4200 1136 4580" fill="none" stroke="#eee2ff" stroke-width="34" opacity="0.82"/>'
  + '<path d="M2580 4000 C2720 4140 2850 4270 2960 4580 M1516 4000 C1376 4140 1246 4270 1136 4580" fill="none" stroke="#d8c4ff" stroke-width="24"/>'
  + '<path d="M2470 3990 C2580 4050 2680 4160 2760 4300 M1626 3990 C1516 4050 1416 4160 1336 4300" fill="none" stroke="#e9dfff" stroke-width="18"/>');

writeSvg("Stocking_L", ''
  + '<path d="M1700 3890 C1780 3950 1910 3970 2040 3920 L2040 5480 C2010 5600 1880 5640 1770 5560 L1700 4650 Z" fill="url(#black)" stroke="#171827" stroke-width="24"/>'
  + '<path d="M1740 3970 C1840 4010 1920 4010 2010 3980" fill="none" stroke="#11121e" stroke-width="20"/>');

writeSvg("Stocking_R", ''
  + '<path d="M2396 3890 C2316 3950 2186 3970 2056 3920 L2056 5480 C2086 5600 2216 5640 2326 5560 L2396 4650 Z" fill="url(#black)" stroke="#171827" stroke-width="24"/>'
  + '<path d="M2356 3970 C2256 4010 2176 4010 2086 3980" fill="none" stroke="#11121e" stroke-width="20"/>');

writeSvg("LaceTop_L", ''
  + '<path d="M1680 3850 C1800 3910 1910 3920 2040 3870 L2040 4070 C1910 4120 1790 4110 1690 4050 Z" fill="#211f2f" stroke="#efe5ff" stroke-width="18"/>'
  + '<path d="M1690 3930 L1740 4020 L1790 3930 L1840 4040 L1890 3940 L1940 4020 L1990 3920" fill="none" stroke="#d8c8ee" stroke-width="20"/>');

writeSvg("LaceTop_R", ''
  + '<path d="M2416 3850 C2296 3910 2186 3920 2056 3870 L2056 4070 C2186 4120 2306 4110 2406 4050 Z" fill="#211f2f" stroke="#efe5ff" stroke-width="18"/>'
  + '<path d="M2406 3930 L2356 4020 L2306 3930 L2256 4040 L2206 3940 L2156 4020 L2106 3920" fill="none" stroke="#d8c8ee" stroke-width="20"/>');

writeSvg("Shoe_L", ''
  + '<path d="M1760 5400 C1860 5460 1970 5460 2040 5410 L2160 5660 C2080 5800 1880 5840 1620 5770 C1580 5690 1640 5510 1760 5400 Z" fill="url(#black)" stroke="#141521" stroke-width="28"/>'
  + '<path d="M1770 5500 C1870 5560 1980 5560 2070 5500" fill="none" stroke="#aaa3c4" stroke-width="26"/>'
  + '<path d="M1870 5530 L1930 5680" stroke="#e8dfff" stroke-width="24"/><path d="M1730 5740 L2110 5740" stroke="#0e0f18" stroke-width="36"/>');

writeSvg("Shoe_R", ''
  + '<path d="M2336 5400 C2236 5460 2126 5460 2056 5410 L1936 5660 C2016 5800 2216 5840 2476 5770 C2516 5690 2456 5510 2336 5400 Z" fill="url(#black)" stroke="#141521" stroke-width="28"/>'
  + '<path d="M2326 5500 C2226 5560 2116 5560 2026 5500" fill="none" stroke="#aaa3c4" stroke-width="26"/>'
  + '<path d="M2226 5530 L2166 5680" stroke="#e8dfff" stroke-width="24"/><path d="M2366 5740 L1986 5740" stroke="#0e0f18" stroke-width="36"/>');

writeSvg("Face_Base", ''
  + '<ellipse cx="2048" cy="1250" rx="520" ry="650" fill="url(#skin)" stroke="#c9859a" stroke-width="24"/>'
  + '<path d="M1580 1260 C1510 1170 1510 1020 1580 950 C1640 930 1680 1010 1680 1120 C1680 1240 1630 1310 1580 1260 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="20"/>'
  + '<path d="M2516 1260 C2586 1170 2586 1020 2516 950 C2456 930 2416 1010 2416 1120 C2416 1240 2466 1310 2516 1260 Z" fill="url(#skin)" stroke="#c9859a" stroke-width="20"/>'
  + '<path d="M2048 1430 C2010 1510 2010 1570 2048 1600 C2086 1570 2086 1510 2048 1430" fill="none" stroke="#c9859a" stroke-width="18"/>'
  + '<ellipse cx="1840" cy="1470" rx="110" ry="48" fill="#e89baa" opacity="0.35"/><ellipse cx="2256" cy="1470" rx="110" ry="48" fill="#e89baa" opacity="0.35"/>');

writeSvg("Eye_L", ''
  + '<path d="M1640 1220 C1740 1070 1930 1070 2010 1220 C1940 1360 1730 1380 1640 1220 Z" fill="#fffaff" stroke="#3b3455" stroke-width="28"/>'
  + '<ellipse cx="1835" cy="1225" rx="100" ry="128" fill="url(#gem)" stroke="#3e2d75" stroke-width="24"/>'
  + '<ellipse cx="1845" cy="1250" rx="43" ry="76" fill="#1f173d"/><circle cx="1805" cy="1175" r="27" fill="#ffffff"/><circle cx="1878" cy="1295" r="16" fill="#d9c6ff"/>'
  + '<path d="M1625 1205 C1730 1035 1920 1025 2025 1190" fill="none" stroke="#2c2447" stroke-width="46"/>'
  + '<path d="M1650 1300 C1760 1390 1900 1390 1990 1310" fill="none" stroke="#8f7ca8" stroke-width="18"/>'
  + '<path d="M1600 1190 L1540 1140 M1620 1160 L1570 1080" stroke="#2c2447" stroke-width="24"/>');

writeSvg("Eye_R", ''
  + '<path d="M2086 1220 C2166 1070 2356 1070 2456 1220 C2366 1380 2156 1360 2086 1220 Z" fill="#fffaff" stroke="#3b3455" stroke-width="28"/>'
  + '<ellipse cx="2261" cy="1225" rx="100" ry="128" fill="url(#gem)" stroke="#3e2d75" stroke-width="24"/>'
  + '<ellipse cx="2251" cy="1250" rx="43" ry="76" fill="#1f173d"/><circle cx="2291" cy="1175" r="27" fill="#ffffff"/><circle cx="2218" cy="1295" r="16" fill="#d9c6ff"/>'
  + '<path d="M2071 1190 C2176 1025 2366 1035 2471 1205" fill="none" stroke="#2c2447" stroke-width="46"/>'
  + '<path d="M2106 1310 C2196 1390 2336 1390 2446 1300" fill="none" stroke="#8f7ca8" stroke-width="18"/>'
  + '<path d="M2496 1190 L2556 1140 M2476 1160 L2526 1080" stroke="#2c2447" stroke-width="24"/>');

writeSvg("Brows", ''
  + '<path d="M1660 1010 C1770 940 1900 940 1980 1000" fill="none" stroke="#aaa0c3" stroke-width="32" stroke-linecap="round"/>'
  + '<path d="M2116 1000 C2196 940 2326 940 2436 1010" fill="none" stroke="#aaa0c3" stroke-width="32" stroke-linecap="round"/>');

writeSvg("Mouth", ''
  + '<path d="M1880 1690 C1980 1640 2116 1640 2216 1690 C2136 1800 1960 1800 1880 1690 Z" fill="#7c3e68" stroke="#4f2a4d" stroke-width="22"/>'
  + '<path d="M1900 1680 C2000 1710 2100 1710 2200 1680" fill="none" stroke="#fff3f3" stroke-width="26"/>'
  + '<path d="M1950 1770 C2010 1720 2090 1720 2150 1770 C2100 1820 2000 1820 1950 1770 Z" fill="#e88ea8"/>'
  + '<path d="M1870 1690 C1900 1650 1930 1650 1960 1680 M2216 1690 C2186 1650 2156 1650 2126 1680" fill="none" stroke="#bd718d" stroke-width="20"/>');

writeSvg("Hair_Front", ''
  + '<path d="M1520 1040 C1470 650 1640 330 2048 320 C2456 330 2626 650 2576 1040 C2460 900 2380 780 2280 700 L2160 1080 L2050 820 L1920 1080 L1810 760 L1680 1100 Z" fill="url(#hair2)" stroke="#8d88a8" stroke-width="26"/>'
  + '<path d="M1610 880 C1500 1320 1530 1650 1460 2120 C1430 2300 1490 2440 1590 2500 C1710 2320 1740 2030 1780 1720 L1840 1220 Z" fill="url(#hair)" stroke="#8d88a8" stroke-width="24"/>'
  + '<path d="M2486 880 C2596 1320 2566 1650 2636 2120 C2666 2300 2606 2440 2506 2500 C2386 2320 2356 2030 2316 1720 L2256 1220 Z" fill="url(#hair)" stroke="#8d88a8" stroke-width="24"/>'
  + '<path d="M1690 700 C1760 550 1850 480 1930 440 M1840 760 C1900 590 1970 500 2040 450 M2260 760 C2200 590 2130 500 2060 450" fill="none" stroke="#ffffff" stroke-width="42" opacity="0.85"/>'
  + '<path d="M1590 2050 C1650 2230 1700 2350 1770 2440 M2506 2050 C2446 2230 2396 2350 2326 2440" fill="none" stroke="#b6acd1" stroke-width="32"/>'
  + '<path d="M2048 320 C2100 180 2190 180 2260 250" fill="none" stroke="#8d88a8" stroke-width="26"/>'
  + '<path d="M2260 250 C2310 160 2390 180 2420 240" fill="none" stroke="#8d88a8" stroke-width="24"/>');

writeSvg("Hair_Ornaments", ''
  + '<path d="M2460 720 C2540 650 2650 650 2730 720 C2650 800 2540 800 2460 720 Z" fill="#bda2f0" stroke="#66509b" stroke-width="24"/>'
  + '<path d="M2580 650 L2580 790 M2640 660 L2640 780" stroke="#f3eaff" stroke-width="18"/>'
  + '<path d="M2670 790 L2670 1070 M2720 790 L2720 1160" stroke="#c9bfdc" stroke-width="18"/>'
  + '<path d="M2670 1070 L2630 1150 L2670 1230 L2710 1150 Z M2720 1160 L2680 1240 L2720 1320 L2760 1240 Z" fill="url(#gem)" stroke="#4e3b87" stroke-width="18"/>');

writeSvg("Cape_Rose_Gem", ''
  + '<g transform="translate(2640 1980)"><circle cx="0" cy="0" r="125" fill="#d59ac8" stroke="#835d9e" stroke-width="22"/><path d="M0 -100 C-90 -160 -140 -50 -80 0 C-150 60 -40 140 0 70 C40 140 150 60 80 0 C140 -50 90 -160 0 -100 Z" fill="#f0c8e8" stroke="#9b6aab" stroke-width="18"/><circle cx="0" cy="0" r="34" fill="#b66aa8"/></g>'
  + '<path d="M2048 1890 L2048 2170" stroke="#d8d4e8" stroke-width="28"/>'
  + '<path d="M2048 2080 L2048 2330 L1960 2420 L2048 2510 L2136 2420 L2048 2330" fill="url(#gem)" stroke="#4e3b87" stroke-width="22"/>'
  + '<path d="M2018 2250 L2048 2200 L2078 2250" fill="none" stroke="#ffffff" stroke-width="18"/>');

writeSvg("Chains", ''
  + '<path d="M1270 2020 C1500 1900 1730 1920 1940 2070 C2000 2110 2060 2110 2120 2070 C2330 1920 2560 1900 2830 2020" fill="none" stroke="#c9c1d8" stroke-width="24" stroke-dasharray="58 24"/>'
  + '<path d="M1490 2550 C1660 2680 1790 2740 1900 2800 M2606 2550 C2436 2680 2306 2740 2196 2800" fill="none" stroke="#c9c1d8" stroke-width="22" stroke-dasharray="54 22"/>'
  + '<path d="M1510 2460 L1510 2790 M2586 2460 L2586 2790" stroke="#c9c1d8" stroke-width="18"/>'
  + '<path d="M1510 2790 L1460 2880 L1510 2980 L1560 2880 Z M2586 2790 L2536 2880 L2586 2980 L2636 2880 Z" fill="url(#gem)" stroke="#4e3b87" stroke-width="18"/>'
  + '<path d="M1710 3300 L1710 3610 M2386 3300 L2386 3610" stroke="#d8d4e8" stroke-width="18"/>'
  + '<path d="M1710 3610 L1660 3700 L1710 3800 L1760 3700 Z M2386 3610 L2336 3700 L2386 3800 L2436 3700 Z" fill="url(#gem)" stroke="#4e3b87" stroke-width="18"/>');

writeSvg("Skirt_Decor", ''
  + '<g fill="none" stroke="#e8dfff" stroke-width="20"><path d="M1270 3970 C1380 3840 1480 3830 1580 3920 C1660 4000 1710 4140 1780 4250"/><path d="M2826 3970 C2716 3840 2616 3830 2516 3920 C2436 4000 2386 4140 2316 4250"/></g>'
  + '<g fill="#d79ac9" stroke="#8b5e9c" stroke-width="18"><circle cx="1390" cy="4010" r="48"/><circle cx="2706" cy="4010" r="48"/></g>'
  + '<path d="M1390 3960 C1340 3890 1260 3920 1290 3990 C1220 4020 1280 4100 1350 4060 C1390 4140 1470 4080 1430 4010 C1500 3980 1460 3900 1390 3960 Z" fill="#f0c8e8" stroke="#9b6aab" stroke-width="16"/>'
  + '<path d="M2706 3960 C2756 3890 2836 3920 2806 3990 C2876 4020 2816 4100 2746 4060 C2706 4140 2626 4080 2666 4010 C2596 3980 2636 3900 2706 3960 Z" fill="#f0c8e8" stroke="#9b6aab" stroke-width="16"/>');

/* Build guide and art groups in visual stack order, bottom to top. */
var doc = app.documents.add(W, H, 300, "baoyin-b1-front-v001", NewDocumentMode.RGB, DocumentFill.TRANSPARENT);
var guide = doc.layerSets.add(); guide.name = "00_GUIDE"; guide.visible = false;
addEmpty(guide, "ColorPalette", false);
addEmpty(guide, "Reference_Main_LOCKED", false);
addEmpty(guide, "Reference_Orthographic_LOCKED", false);
addEmpty(guide, "Centerline", false);
addEmpty(guide, "SafeBoundary", false);

var groups = {};
var groupOrder = [
  "06_HAIR_BACK","08_BODY","09_BLOUSE","10_WAISTCOAT","12_SKIRT","13_LEGS_STOCKINGS_SHOES","11_CAPE",
  "01_FACE_BASE","02_EYES_L","03_EYES_R","04_BROWS","05_MOUTH","07_HAIR_FRONT","14_ACCESSORIES","15_EFFECT_OPTIONAL"
];
for (var gi = 0; gi < groupOrder.length; gi++) {
  var g = doc.layerSets.add(); g.name = groupOrder[gi]; groups[groupOrder[gi]] = g;
}

placeSvg("BackHair_Base", groups["06_HAIR_BACK"]);
placeSvg("Body_Torso", groups["08_BODY"]);
placeSvg("Arms_Hands", groups["08_BODY"]);
placeSvg("Legs", groups["08_BODY"]);
placeSvg("Blouse_Torso", groups["09_BLOUSE"]);
placeSvg("Sleeve_L", groups["09_BLOUSE"]);
placeSvg("Sleeve_R", groups["09_BLOUSE"]);
placeSvg("Waistcoat", groups["10_WAISTCOAT"]);
placeSvg("Skirt_Outer", groups["12_SKIRT"]);
placeSvg("Skirt_Lavender", groups["12_SKIRT"]);
placeSvg("Stocking_L", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("Stocking_R", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("LaceTop_L", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("LaceTop_R", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("Shoe_L", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("Shoe_R", groups["13_LEGS_STOCKINGS_SHOES"]);
placeSvg("Cape_L", groups["11_CAPE"]);
placeSvg("Cape_R", groups["11_CAPE"]);
placeSvg("Face_Base", groups["01_FACE_BASE"]);
placeSvg("Eye_L", groups["02_EYES_L"]);
placeSvg("Eye_R", groups["03_EYES_R"]);
placeSvg("Brows", groups["04_BROWS"]);
placeSvg("Mouth", groups["05_MOUTH"]);
placeSvg("Hair_Front", groups["07_HAIR_FRONT"]);
placeSvg("Hair_Ornaments", groups["14_ACCESSORIES"]);
placeSvg("Cape_Rose_Gem", groups["14_ACCESSORIES"]);
placeSvg("Chains", groups["14_ACCESSORIES"]);
placeSvg("Skirt_Decor", groups["14_ACCESSORIES"]);

var effects = groups["15_EFFECT_OPTIONAL"];
addEmpty(effects, "Blush_Strong", false);
addEmpty(effects, "Tear_L", false);
addEmpty(effects, "Tear_R", false);
addEmpty(effects, "SweatDrop", false);
addEmpty(effects, "AngerMark", false);
addEmpty(effects, "ConfusionMark", false);

addTextNote(doc, "B1 formal layered redraw; source SVGs retained in source/svg; Cubism import is intentionally deferred");

var psd = new PhotoshopSaveOptions();
psd.layers = true;
doc.saveAs(new File(WORKING_PSD), psd, true, Extension.LOWERCASE);
doc.saveAs(new File(FORMAL_PSD), psd, true, Extension.LOWERCASE);

var png = new ExportOptionsSaveForWeb();
png.format = SaveDocumentType.PNG;
png.PNG8 = false;
png.transparency = true;
png.interlaced = false;
png.quality = 100;
doc.exportDocument(new File(COMPOSITE_PNG), ExportType.SAVEFORWEB, png);

alert("B1 formal PSD created\n" + FORMAL_PSD + "\nLayers: " + doc.layers.length + " top-level entries\nComposite: " + COMPOSITE_PNG);
