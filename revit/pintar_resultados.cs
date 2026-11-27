// NexoBIM · Pinta en la vista 3D "NexoBIM E.070":
//  - muros según el motor (cuenta / no cuenta / tabique / opción propuesta) + parámetro Comentarios
//  - losas de cada nivel según cumpla o no la densidad (semitransparentes)
// data = { muros: { "<ElementId>": { estado, texto } }, niveles: { "<nombre nivel>": "cumple"|"no_cumple" }, limpiar?: bool }
// Reversible con Deshacer.
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    static readonly Dictionary<string, Color> COL = new Dictionary<string, Color>
    {
        ["cuenta"] = new Color(34, 197, 94),
        ["no_cuenta"] = new Color(239, 68, 68),
        ["tabique"] = new Color(148, 163, 184),
        ["opcion"] = new Color(56, 189, 248),
        ["cumple"] = new Color(34, 197, 94),
        ["no_cumple"] = new Color(239, 68, 68),
    };

    public static object Run(UIApplication app, JObject data)
    {
        var uidoc = app.ActiveUIDocument ?? throw new Exception("No hay un modelo abierto.");
        var doc = uidoc.Document;
        bool limpiar = (bool?)data["limpiar"] == true;
        var solido = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement)).Cast<FillPatternElement>().First(f => f.GetFillPattern().IsSolidFill);
        OverrideGraphicSettings Color(string estado, int transp)
        {
            var o = new OverrideGraphicSettings();
            if (limpiar || !COL.TryGetValue(estado ?? "", out var c)) return o;
            return o.SetSurfaceForegroundPatternId(solido.Id).SetSurfaceForegroundPatternColor(c)
                    .SetCutForegroundPatternId(solido.Id).SetCutForegroundPatternColor(c).SetSurfaceTransparency(transp);
        }
        View3D vista;
        int n = 0;
        using (var t = new Transaction(doc, "NexoBIM · Pintar verificación E.070"))
        {
            t.Start();
            var vft3d = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(v => v.ViewFamily == ViewFamily.ThreeDimensional);
            vista = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().FirstOrDefault(v => (v.Name == "NexoBIM E.070" || v.Name == "TRAZA E.070") && !v.IsTemplate)
                    ?? View3D.CreateIsometric(doc, vft3d.Id);
            if (vista.Name != "NexoBIM E.070") vista.Name = "NexoBIM E.070";
            vista.DisplayStyle = DisplayStyle.ShadingWithEdges;
            vista.DetailLevel = ViewDetailLevel.Fine;
            // Vista limpia: sin niveles, ejes, marcas de alzado ni secciones.
            foreach (var bic in new[] { BuiltInCategory.OST_Levels, BuiltInCategory.OST_Grids, BuiltInCategory.OST_Elev, BuiltInCategory.OST_Sections, BuiltInCategory.OST_CLines })
            {
                var cat = Category.GetCategory(doc, bic);
                if (cat != null && vista.CanCategoryBeHidden(cat.Id)) vista.SetCategoryHidden(cat.Id, true);
            }

            var niveles = data["niveles"] as JObject;
            foreach (var f in new FilteredElementCollector(doc).OfClass(typeof(Floor)).Cast<Floor>())
            {
                var lv = doc.GetElement(f.LevelId) as Level;
                string est = lv != null ? (string)niveles?[lv.Name] : null;
                vista.SetElementOverrides(f.Id, est != null ? Color(est, 80) : new OverrideGraphicSettings().SetSurfaceTransparency(85));
            }

            foreach (var kv in (JObject)data["muros"])
            {
                var el = doc.GetElement(new ElementId(long.Parse(kv.Key)));
                if (el == null) continue;
                var estado = (string)kv.Value["estado"];
                vista.SetElementOverrides(el.Id, Color(estado, estado == "tabique" ? 50 : 0));
                el.get_Parameter(BuiltInParameter.ALL_MODEL_INSTANCE_COMMENTS)?.Set(limpiar ? "" : (string)kv.Value["texto"]);
                n++;
            }
            t.Commit();
        }
        uidoc.ActiveView = vista;
        uidoc.GetOpenUIViews().FirstOrDefault(v => v.ViewId == vista.Id)?.ZoomToFit();
        return $"{n} muros pintados en la vista 'NexoBIM E.070'.";
    }
}
