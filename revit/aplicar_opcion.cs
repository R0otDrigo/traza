// NexoBIM · Aplica en Revit una opción aprobada por el ingeniero:
//  - convertir_tabique:   cambia el muro a un tipo portante y lo marca estructural.
//  - aumentar_espesor:    cambia el muro al tipo de aparejo de cabeza (t = 0.23 m).
//  - alinear_continuidad: desplaza el muro (con sus vanos) para apoyarlo sobre el muro inferior.
// data = { muroId, accion, espesor, dx, dy }  (m). Si el tipo destino no existe, lo crea. Reversible con Deshacer.
using System;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    const double FT = 0.3048;

    public static object Run(UIApplication app, JObject data)
    {
        var doc = app.ActiveUIDocument?.Document ?? throw new Exception("No hay un modelo abierto.");
        var w = doc.GetElement(new ElementId(long.Parse((string)data["muroId"]))) as Wall ?? throw new Exception("Muro no encontrado.");
        string accion = (string)data["accion"];
        string msg;
        using (var t = new Transaction(doc, $"NexoBIM · {accion} {w.Id}"))
        {
            t.Start();
            if (accion == "alinear_continuidad")
            {
                double dx = (double?)data["dx"] ?? 0, dy = (double?)data["dy"] ?? 0;
                ElementTransformUtils.MoveElement(doc, w.Id, new XYZ(dx / FT, dy / FT, 0));
                msg = $"Muro {w.Id} desplazado ({dx}, {dy}) m para recuperar continuidad vertical.";
            }
            else
            {
                double esp = (double)data["espesor"];
                string nombre = esp >= 0.2 ? "Muro KK cabeza 23" : "Muro KK soga 13";
                string antes = w.WallType.Name;
                var wt = new FilteredElementCollector(doc).OfClass(typeof(WallType)).Cast<WallType>().FirstOrDefault(x => x.Name == nombre);
                if (wt == null)
                {
                    wt = (WallType)w.WallType.Duplicate(nombre);
                    var cs = wt.GetCompoundStructure();
                    var mat = cs?.GetLayers().FirstOrDefault(l => l.Function == MaterialFunctionAssignment.Structure)?.MaterialId ?? ElementId.InvalidElementId;
                    wt.SetCompoundStructure(CompoundStructure.CreateSingleLayerCompoundStructure(MaterialFunctionAssignment.Structure, esp / FT, mat));
                }
                w.WallType = wt;
                w.get_Parameter(BuiltInParameter.WALL_STRUCTURAL_SIGNIFICANT)?.Set(1);
                msg = $"Muro {w.Id}: {antes} → {nombre} (estructural).";
            }
            t.Commit();
        }
        return msg;
    }
}
