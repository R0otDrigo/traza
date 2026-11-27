// NexoBIM · Guarda el documento activo (para que el ingeniero conserve el modelo verificado).
using System;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    public static object Run(UIApplication app, JObject data)
    {
        var doc = app.ActiveUIDocument?.Document ?? throw new Exception("No hay un modelo abierto.");
        if (string.IsNullOrEmpty(doc.PathName)) return "El modelo no tiene ruta; usa Guardar como en Revit.";
        doc.Save();
        return $"Guardado: {doc.PathName}";
    }
}
