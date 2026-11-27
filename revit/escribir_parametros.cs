// NexoBIM · Crea (si no existen) y escribe parámetros compartidos NexoBIM_* en muros (instancia) e información del proyecto.
// data = { muros: { "<ElementId>": { "NexoBIM_Estado": "cuenta", "NexoBIM_Tramo_Lt": 0.52, ... } }, proyecto: { "NexoBIM_Z": 0.35, ... } }
// Números → parámetro Número; texto → Texto. Archivo propio %APPDATA%\NexoBIM\NexoBIM_parametros.txt (se restaura el del usuario).
// Además crea filtros de vista de color por NexoBIM_Estado en la vista "NexoBIM E.070" (o la activa). Reversible con Deshacer.
using System;
using System.IO;
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
    };

    public static object Run(UIApplication app, JObject data)
    {
        var uidoc = app.ActiveUIDocument ?? throw new Exception("No hay un modelo abierto en Revit.");
        var doc = uidoc.Document;
        var a = app.Application;
        var muros = data["muros"] as JObject ?? new JObject();
        var proyecto = data["proyecto"] as JObject ?? new JObject();
        var ruta = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "NexoBIM", "NexoBIM_parametros.txt");
        Directory.CreateDirectory(Path.GetDirectoryName(ruta));
        if (!File.Exists(ruta)) File.WriteAllText(ruta, "");
        var previo = a.SharedParametersFilename;
        int n = 0;
        try
        {
            a.SharedParametersFilename = ruta;
            var archivo = a.OpenSharedParameterFile();
            var grupo = archivo.Groups.get_Item("NexoBIM") ?? archivo.Groups.Create("NexoBIM");
            using (var t = new Transaction(doc, "NexoBIM · Escribir parámetros"))
            {
                t.Start();
                var porCategoria = new[]
                {
                    (BuiltInCategory.OST_Walls, muros.Properties().SelectMany(m => ((JObject)m.Value).Properties())),
                    (BuiltInCategory.OST_ProjectInformation, proyecto.Properties()),
                };
                foreach (var (bic, props) in porCategoria)
                {
                    var cats = a.Create.NewCategorySet();
                    cats.Insert(Category.GetCategory(doc, bic));
                    foreach (var p in props.GroupBy(p => p.Name).Select(g => g.First()))
                    {
                        bool num = p.Value.Type == JTokenType.Float || p.Value.Type == JTokenType.Integer;
                        var def = grupo.Definitions.get_Item(p.Name)
                                  ?? grupo.Definitions.Create(new ExternalDefinitionCreationOptions(p.Name, num ? SpecTypeId.Number : SpecTypeId.String.Text));
                        doc.ParameterBindings.Insert(def, a.Create.NewInstanceBinding(cats), GroupTypeId.IdentityData); // false si ya estaba
                    }
                }
                doc.Regenerate();

                void Escribir(Element el, JObject valores)
                {
                    foreach (var p in valores.Properties())
                    {
                        var par = el.LookupParameter(p.Name);
                        if (par == null || par.IsReadOnly || p.Value.Type == JTokenType.Null) continue;
                        if (par.StorageType == StorageType.Double) par.Set((double)p.Value); else par.Set(p.Value.ToString());
                    }
                }
                foreach (var kv in muros)
                {
                    var el = doc.GetElement(new ElementId(long.Parse(kv.Key)));
                    if (el is Wall) { Escribir(el, (JObject)kv.Value); n++; }
                }
                Escribir(doc.ProjectInformation, proyecto);

                // Filtros de color por NexoBIM_Estado (el dato vive en el modelo; los overrides de pintar tienen prioridad).
                var est = grupo.Definitions.get_Item("NexoBIM_Estado") as ExternalDefinition;
                var spe = est != null ? SharedParameterElement.Lookup(doc, est.GUID) : null;
                var vista = new FilteredElementCollector(doc).OfClass(typeof(View3D)).Cast<View3D>().FirstOrDefault(v => v.Name == "NexoBIM E.070" && !v.IsTemplate) as View ?? doc.ActiveView;
                if (spe != null && vista.AreGraphicsOverridesAllowed())
                {
                    var solido = new FilteredElementCollector(doc).OfClass(typeof(FillPatternElement)).Cast<FillPatternElement>().First(f => f.GetFillPattern().IsSolidFill);
                    foreach (var c in COL)
                    {
                        var nombre = "NexoBIM · " + c.Key;
                        var f = new FilteredElementCollector(doc).OfClass(typeof(ParameterFilterElement)).Cast<ParameterFilterElement>().FirstOrDefault(x => x.Name == nombre)
                                ?? ParameterFilterElement.Create(doc, nombre, new List<ElementId> { new ElementId(BuiltInCategory.OST_Walls) },
                                       new ElementParameterFilter(ParameterFilterRuleFactory.CreateEqualsRule(spe.Id, c.Key)));
                        if (!vista.IsFilterApplied(f.Id)) vista.AddFilter(f.Id);
                        vista.SetFilterOverrides(f.Id, new OverrideGraphicSettings()
                            .SetSurfaceForegroundPatternId(solido.Id).SetSurfaceForegroundPatternColor(c.Value)
                            .SetCutForegroundPatternId(solido.Id).SetCutForegroundPatternColor(c.Value));
                    }
                }
                t.Commit();
            }
        }
        finally { a.SharedParametersFilename = previo ?? ""; }
        return $"Parámetros NexoBIM escritos en {n} muros y en la información del proyecto.";
    }
}
