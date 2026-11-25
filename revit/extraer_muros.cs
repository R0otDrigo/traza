// TRAZA · Extrae muros, vanos, niveles y área techada del modelo abierto (solo lectura).
// Se ejecuta dentro de Revit vía rvt-mcp (revit_send_code_to_revit). Devuelve JSON en metros.
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    const double FT = 0.3048;
    static double M(double ft) => Math.Round(ft * FT, 4);

    public static object Run(UIApplication app, JObject data)
    {
        var doc = app.ActiveUIDocument?.Document ?? throw new Exception("No hay un modelo abierto en Revit.");

        // Área techada por nivel (suma de losas) y área típica (la mayor).
        var areaPorNivel = new FilteredElementCollector(doc).OfClass(typeof(Floor)).Cast<Floor>()
            .GroupBy(f => f.LevelId)
            .ToDictionary(g => g.Key, g => g.Sum(f => f.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0) * FT * FT);
        double areaTipica = areaPorNivel.Count > 0 ? areaPorNivel.Values.Max() : 0;

        var muros = new FilteredElementCollector(doc).OfClass(typeof(Wall)).Cast<Wall>()
            .Where(w => w.Location is LocationCurve lc && lc.Curve is Line && !w.IsStackedWallMember && w.WallType.Kind == WallKind.Basic)
            .ToList();

        // Vanos alojados en cada muro: puertas/ventanas (FamilyInstance) y huecos (Opening).
        var vanos = new Dictionary<long, List<JObject>>();
        void Add(Wall w, double offFt, double anchoFt, string tipo, ElementId id)
        {
            if (!vanos.TryGetValue(w.Id.Value, out var l)) vanos[w.Id.Value] = l = new List<JObject>();
            l.Add(new JObject { ["id"] = id.Value.ToString(), ["offset"] = M(offFt), ["ancho"] = M(anchoFt), ["tipo"] = tipo });
        }
        foreach (var fi in new FilteredElementCollector(doc).OfClass(typeof(FamilyInstance)).Cast<FamilyInstance>())
        {
            if (!(fi.Host is Wall w) || !(fi.Location is LocationPoint lp) || !(w.Location is LocationCurve wc)) continue;
            var cat = fi.Category?.BuiltInCategory;
            if (cat != BuiltInCategory.OST_Doors && cat != BuiltInCategory.OST_Windows) continue;
            var bip = cat == BuiltInCategory.OST_Doors ? BuiltInParameter.DOOR_WIDTH : BuiltInParameter.WINDOW_WIDTH;
            double ancho = fi.get_Parameter(bip)?.AsDouble() ?? fi.Symbol.get_Parameter(bip)?.AsDouble() ?? fi.Symbol.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)?.AsDouble() ?? 0;
            var line = (Line)wc.Curve;
            double s = (lp.Point - line.GetEndPoint(0)).DotProduct(line.Direction);
            Add(w, s - ancho / 2, ancho, cat == BuiltInCategory.OST_Doors ? "puerta" : "ventana", fi.Id);
        }
        foreach (var op in new FilteredElementCollector(doc).OfClass(typeof(Opening)).Cast<Opening>())
        {
            if (!(op.Host is Wall w) || !op.IsRectBoundary || !(w.Location is LocationCurve wc)) continue;
            var line = (Line)wc.Curve;
            var r = op.BoundaryRect;
            double a = (r[0] - line.GetEndPoint(0)).DotProduct(line.Direction), b = (r[1] - line.GetEndPoint(0)).DotProduct(line.Direction);
            Add(w, Math.Min(a, b), Math.Abs(b - a), "vano", op.Id);
        }

        var niveles = new Dictionary<ElementId, Level>();
        var outMuros = new JArray();
        foreach (var w in muros)
        {
            var line = (Line)((LocationCurve)w.Location).Curve;
            var lvl = doc.GetElement(w.LevelId) as Level;
            if (lvl == null) continue;
            niveles[lvl.Id] = lvl;
            var bb = w.get_BoundingBox(null);
            var cs = w.WallType.GetCompoundStructure();
            var matId = cs?.GetLayers().Where(l => l.Function == MaterialFunctionAssignment.Structure).Select(l => l.MaterialId).FirstOrDefault() ?? ElementId.InvalidElementId;
            var p0 = line.GetEndPoint(0); var p1 = line.GetEndPoint(1);
            outMuros.Add(new JObject
            {
                ["id"] = w.Id.Value.ToString(),
                ["marca"] = w.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.AsString() ?? "",
                ["nivel"] = lvl.Name,
                ["x1"] = M(p0.X), ["y1"] = M(p0.Y), ["x2"] = M(p1.X), ["y2"] = M(p1.Y),
                ["t"] = M(w.Width),
                ["h"] = bb != null ? M(bb.Max.Z - bb.Min.Z) : 0,
                ["tipoRevit"] = w.WallType.Name,
                ["estructural"] = w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)?.AsInteger() == 1,
                ["funcion"] = w.WallType.Function.ToString(),
                ["material"] = (doc.GetElement(matId) as Material)?.Name ?? "",
                ["comentarios"] = w.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.AsString() ?? "",
                ["aberturas"] = new JArray(vanos.TryGetValue(w.Id.Value, out var l) ? l : new List<JObject>()),
            });
        }

        var outNiveles = new JArray(niveles.Values.OrderBy(l => l.Elevation).Select(l => new JObject
        {
            ["nombre"] = l.Name,
            ["elevacion"] = M(l.Elevation),
            ["area"] = Math.Round(areaPorNivel.TryGetValue(l.Id, out var a) && a > 0 ? a : areaTipica, 3),
        }));

        return new JObject
        {
            ["documento"] = doc.Title,
            ["ruta"] = doc.PathName,
            ["niveles"] = outNiveles,
            ["muros"] = outMuros,
        }.ToString(Newtonsoft.Json.Formatting.None);
    }
}
