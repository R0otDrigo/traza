// TRAZA · Construye en el modelo ABIERTO (proyecto nuevo y vacío) la vivienda de prueba
// a partir del mismo JSON que usan los tests (src/e070/caso.ts). Todo queda en el Undo de Revit.
// data = { niveles:[{nombre, elevacion, area}], muros:[{id, nivel, x1,y1,x2,y2, t, h, rol, tipoRevit, aberturas:[{offset, ancho, tipo}]}], alturaPiso, losa:{exterior:[[x,y]], huecos:[[[x,y]]]} }
using System;
using System.Linq;
using System.Collections.Generic;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    const double FT = 0.3048;
    static double F(double m) => m / FT;

    public static object Run(UIApplication app, JObject data)
    {
        var uidoc = app.ActiveUIDocument ?? throw new Exception("Abre un proyecto nuevo y vacío en Revit.");
        var doc = uidoc.Document;
        double hPiso = (double)data["alturaPiso"];
        var log = new List<string>();
        View3D vista = null;

        using (var t = new Transaction(doc, "TRAZA · Crear vivienda de prueba"))
        {
            t.Start();

            // Niveles: reutiliza los existentes (renombrados) y crea los que falten + nivel de techo.
            var existentes = new FilteredElementCollector(doc).OfClass(typeof(Level)).Cast<Level>().OrderBy(l => l.Elevation).ToList();
            var nombres = data["niveles"].Select(n => (string)n["nombre"]).Concat(new[] { "Techo" }).ToList();
            var niveles = new Dictionary<string, Level>();
            for (int k = 0; k < nombres.Count; k++)
            {
                var lv = k < existentes.Count ? existentes[k] : Level.Create(doc, F(k * hPiso));
                lv.Elevation = F(k * hPiso);
                try { lv.Name = nombres[k]; } catch { lv.Name = nombres[k] + " (TRAZA)"; }
                niveles[nombres[k]] = lv;
            }
            // Vistas de planta para los niveles nuevos
            var vftPlanta = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(v => v.ViewFamily == ViewFamily.FloorPlan);
            var conPlanta = new FilteredElementCollector(doc).OfClass(typeof(ViewPlan)).Cast<ViewPlan>().Where(v => !v.IsTemplate && v.GenLevel != null).Select(v => v.GenLevel.Id).ToHashSet();
            foreach (var lv in niveles.Values.Where(l => !conPlanta.Contains(l.Id))) ViewPlan.Create(doc, vftPlanta.Id, lv.Id);

            // Materiales y tipos de muro
            Material Mat(string nombre, Color c)
            {
                var m = new FilteredElementCollector(doc).OfClass(typeof(Material)).Cast<Material>().FirstOrDefault(x => x.Name == nombre);
                if (m == null) { m = (Material)doc.GetElement(Material.Create(doc, nombre)); m.Color = c; }
                return m;
            }
            var kk = Mat("Albañilería KK", new Color(178, 96, 72));
            var pand = Mat("Pandereta", new Color(214, 170, 140));
            var basico = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().First(w => w.Kind == WallKind.Basic);
            var tipos = new Dictionary<string, WallType>();
            WallType Tipo(string nombre, double esp, Material mat)
            {
                if (tipos.TryGetValue(nombre, out var wt)) return wt;
                wt = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().FirstOrDefault(w => w.Name == nombre)
                     ?? (WallType)basico.Duplicate(nombre);
                wt.SetCompoundStructure(CompoundStructure.CreateSingleLayerCompoundStructure(MaterialFunctionAssignment.Structure, F(esp), mat.Id));
                return tipos[nombre] = wt;
            }
            // Siempre disponibles para las opciones de mejora:
            Tipo("Muro KK soga 13", 0.13, kk); Tipo("Muro KK cabeza 23", 0.23, kk);

            // Muros + vanos
            foreach (var m in data["muros"])
            {
                bool portante = (string)m["rol"] == "portante";
                var wt = Tipo((string)m["tipoRevit"], (double)m["t"], portante ? kk : pand);
                var lv = niveles[(string)m["nivel"]];
                var p1 = new XYZ(F((double)m["x1"]), F((double)m["y1"]), lv.Elevation);
                var p2 = new XYZ(F((double)m["x2"]), F((double)m["y2"]), lv.Elevation);
                var w = Wall.Create(doc, Line.CreateBound(p1, p2), wt.Id, lv.Id, F(hPiso), 0, false, portante);
                w.get_Parameter(BuiltInParameter.ALL_MODEL_MARK)?.Set((string)m["id"]);
                var dir = (p2 - p1).Normalize();
                foreach (var a in m["aberturas"])
                {
                    string tipo = (string)a["tipo"];
                    // puerta 0–2.1 m · arco de portal 0–(h−0.5) · balcón 0–2.2 · ventana 1.0–2.2
                    var (b0, b1) = tipo == "puerta" ? (0.0, 2.1) : tipo == "arco" ? (0.0, hPiso - 0.5) : tipo == "balcón" ? (0.0, 2.2) : (1.0, 2.2);
                    double z0 = lv.Elevation + F(b0), z1 = lv.Elevation + F(b1);
                    var s = p1 + dir * F((double)a["offset"]);
                    var e = p1 + dir * F((double)a["offset"] + (double)a["ancho"]);
                    doc.Create.NewOpening(w, new XYZ(s.X, s.Y, z0), new XYZ(e.X, e.Y, z1));
                }
            }

            // Losas: una por nivel (incluido techo) con el contorno y los huecos (patios) del caso.
            CurveLoop Lazo(JToken pts)
            {
                var p = pts.Select(q => new XYZ(F((double)q[0]), F((double)q[1]), 0)).ToList();
                return CurveLoop.Create(p.Select((a, i) => (Curve)Line.CreateBound(a, p[(i + 1) % p.Count])).ToList());
            }
            var lazos = new List<CurveLoop> { Lazo(data["losa"]["exterior"]) };
            foreach (var h in data["losa"]["huecos"]) lazos.Add(Lazo(h));
            var ft = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>().First();
            foreach (var lv in niveles.Values) Floor.Create(doc, lazos, ft.Id, lv.Id);

            // Vista 3D de trabajo
            var vft3d = new FilteredElementCollector(doc).OfClass(typeof(ViewFamilyType)).Cast<ViewFamilyType>().First(v => v.ViewFamily == ViewFamily.ThreeDimensional);
            vista = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().FirstOrDefault(v => v.Name == "TRAZA E.070")
                    ?? View3D.CreateIsometric(doc, vft3d.Id);
            if (vista.Name != "TRAZA E.070") vista.Name = "TRAZA E.070";
            vista.DisplayStyle = DisplayStyle.ShadingWithEdges;
            vista.DetailLevel = ViewDetailLevel.Fine;

            t.Commit();
        }
        uidoc.ActiveView = vista;
        return $"Modelo creado: {data["muros"].Count()} muros, {data["niveles"].Count()} niveles + techo. Vista 'TRAZA E.070' activa.";
    }
}
