// NexoBIM · Exporta el documento activo a IFC4 con un Pset "NexoBIM" (parámetros NexoBIM_* de muros y del proyecto).
// data = { ruta: "C:\\...\\modelo.ifc" }
// El Pset se define con un archivo de property sets de usuario (ExportUserDefinedPsets) escrito junto al IFC.
// La exportación va en una transacción que se revierte: el modelo no cambia.
using System;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    const string PSETS =
        "PropertySet:\tNexoBIM\tI\tIfcWall,IfcWallStandardCase\n" +
        "\tNexoBIM_Estado\tText\n\tNexoBIM_Motivo\tText\n\tNexoBIM_Rol\tText\n\tNexoBIM_Tramo_Lt\tReal\n\tNexoBIM_Ratio\tReal\n" +
        "PropertySet:\tNexoBIM\tI\tIfcProject,IfcBuilding\n" +
        "\tNexoBIM_Suelo_Obra\tText\n\tNexoBIM_Suelo_URL\tText\n\tNexoBIM_Suelo_Distancia_m\tReal\n\tNexoBIM_Suelo_Perfil\tText\n" +
        "\tNexoBIM_S\tReal\n\tNexoBIM_S_Fuente\tText\n\tNexoBIM_Z\tReal\n\tNexoBIM_U\tReal\n\tNexoBIM_Norma\tText\n" +
        "\tNexoBIM_Fecha_Verificacion\tText\n\tNexoBIM_Aprobado_Por\tText\n";

    public static object Run(UIApplication app, JObject data)
    {
        var doc = app.ActiveUIDocument?.Document ?? throw new Exception("No hay un modelo abierto en Revit.");
        var ruta = (string)data["ruta"] ?? throw new Exception("Falta data.ruta (.ifc).");
        var carpeta = Path.GetDirectoryName(ruta);
        Directory.CreateDirectory(carpeta);
        var psets = Path.Combine(carpeta, "NexoBIM_psets.txt");
        File.WriteAllText(psets, PSETS);
        var o = new IFCExportOptions { FileVersion = IFCVersion.IFC4 };
        o.AddOption("ExportUserDefinedPsets", "true");
        o.AddOption("ExportUserDefinedPsetsFileName", psets);
        bool ok;
        using (var t = new Transaction(doc, "NexoBIM · Exportar IFC"))
        {
            t.Start();
            ok = doc.Export(carpeta, Path.GetFileName(ruta), o);
            t.RollBack();
        }
        if (!ok || !File.Exists(ruta)) throw new Exception($"Revit no pudo exportar el IFC a {ruta}.");
        return $"IFC4 exportado: {ruta}";
    }
}
