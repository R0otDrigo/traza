// NexoBIM · Crea un proyecto nuevo (plantilla por defecto de Revit) y lo guarda en data.ruta.
// Luego se abre con revit_open_model. No toca ningún documento abierto.
using System;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    public static object Run(UIApplication app, JObject data)
    {
        string ruta = (string)data["ruta"];
        Directory.CreateDirectory(Path.GetDirectoryName(ruta));
        var a = app.Application;
        string plantilla = a.DefaultProjectTemplate;
        Document doc = !string.IsNullOrEmpty(plantilla) && File.Exists(plantilla)
            ? a.NewProjectDocument(plantilla)
            : a.NewProjectDocument(UnitSystem.Metric);
        doc.SaveAs(ruta, new SaveAsOptions { OverwriteExistingFile = true });
        doc.Close(false);
        return ruta;
    }
}
