// NexoBIM · Huella del modelo: SHA-256 de muros (id, curva, tipo, espesor, nivel), vanos (host, posición, ancho),
// tipos de muro, niveles y losas. Solo lectura, sin transacción. Lo consulta el vigilante cada ~5 s.
// Devuelve { huella, muros, vanos }.
using System;
using System.Linq;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    static string P(XYZ p) => $"{p.X:F3},{p.Y:F3},{p.Z:F3}";

    public static object Run(UIApplication app, JObject data)
    {
        var doc = app.ActiveUIDocument?.Document ?? throw new Exception("No hay un modelo abierto en Revit.");
        var l = new List<string>();
        IEnumerable<T> De<T>() where T : Element => new FilteredElementCollector(doc).OfClass(typeof(T)).Cast<T>();

        int muros = 0, vanos = 0;
        foreach (var w in De<Wall>())
        {
            muros++;
            var c = (w.Location as LocationCurve)?.Curve;
            l.Add($"M{w.Id.Value}|{(c == null ? "" : P(c.GetEndPoint(0)) + ";" + P(c.GetEndPoint(1)))}|{w.WallType.Id.Value}|{w.Width:F4}|{w.LevelId.Value}");
        }
        foreach (var fi in De<FamilyInstance>())
        {
            if (!(fi.Host is Wall)) continue;
            vanos++;
            var p = (fi.Location as LocationPoint)?.Point;
            l.Add($"V{fi.Id.Value}|{fi.Host.Id.Value}|{(p == null ? "" : P(p))}|{fi.Symbol.Id.Value}|{fi.get_Parameter(BuiltInParameter.DOOR_WIDTH)?.AsDouble() ?? fi.get_Parameter(BuiltInParameter.WINDOW_WIDTH)?.AsDouble() ?? 0:F4}");
        }
        foreach (var op in De<Opening>())
        {
            if (!(op.Host is Wall) || !op.IsRectBoundary) continue;
            vanos++;
            l.Add($"O{op.Id.Value}|{op.Host.Id.Value}|{P(op.BoundaryRect[0])};{P(op.BoundaryRect[1])}");
        }
        foreach (var t in De<WallType>()) l.Add($"T{t.Id.Value}|{t.Name}|{t.Width:F4}|{t.Function}");
        foreach (var s in De<FamilySymbol>().Where(s => s.Category?.BuiltInCategory == BuiltInCategory.OST_Doors || s.Category?.BuiltInCategory == BuiltInCategory.OST_Windows))
            l.Add($"S{s.Id.Value}|{s.get_Parameter(BuiltInParameter.DOOR_WIDTH)?.AsDouble() ?? s.get_Parameter(BuiltInParameter.WINDOW_WIDTH)?.AsDouble() ?? s.get_Parameter(BuiltInParameter.FAMILY_WIDTH_PARAM)?.AsDouble() ?? 0:F4}");
        foreach (var n in De<Level>()) l.Add($"N{n.Id.Value}|{n.Name}|{n.Elevation:F3}");
        foreach (var f in De<Floor>()) l.Add($"L{f.Id.Value}|{f.LevelId.Value}|{f.get_Parameter(BuiltInParameter.HOST_AREA_COMPUTED)?.AsDouble() ?? 0:F2}");

        l.Sort(StringComparer.Ordinal);
        using (var sha = SHA256.Create())
        {
            var h = sha.ComputeHash(Encoding.UTF8.GetBytes(string.Join("\n", l)));
            return new JObject
            {
                ["huella"] = BitConverter.ToString(h).Replace("-", "").ToLowerInvariant(),
                ["muros"] = muros,
                ["vanos"] = vanos,
            }.ToString(Newtonsoft.Json.Formatting.None);
        }
    }
}
