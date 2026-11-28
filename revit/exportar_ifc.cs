// NexoBIM · Exporta el documento activo a IFC4 con un Pset "NexoBIM" (parámetros NexoBIM_* de muros y del proyecto).
// data = { ruta: "C:\\...\\modelo.ifc" }
// El Pset se define con un archivo de property sets de usuario (ExportUserDefinedPsets) escrito junto al IFC.
// La exportación va en una transacción que se revierte: el modelo no cambia.
using System;
using System.Linq;
using System.IO;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    // Formato del exportador IFC de Revit: "PropertySet:<tab>Nombre<tab>I<tab>Entidades" y por propiedad
    // "<tab>NombreIFC<tab>Tipo<tab>ParámetroRevit" (sin la 3.ª columna el exportador ignora el Pset).
    static string Pset(string entidades, params string[] props) =>
        $"PropertySet:\tNexoBIM\tI\t{entidades}\n" + string.Concat(props.Select(p => { var x = p.Split(':'); return $"\t{x[0]}\t{x[1]}\t{x[0]}\n"; }));
    static readonly string PSETS =
        Pset("IfcWall,IfcWallStandardCase", "NexoBIM_Estado:Text", "NexoBIM_Motivo:Text", "NexoBIM_Rol:Text", "NexoBIM_Tramo_Lt:Real", "NexoBIM_Ratio:Real") +
        Pset("IfcProject,IfcBuilding", "NexoBIM_Suelo_Obra:Text", "NexoBIM_Suelo_URL:Text", "NexoBIM_Suelo_Distancia_m:Real", "NexoBIM_Suelo_Perfil:Text",
             "NexoBIM_S:Real", "NexoBIM_S_Fuente:Text", "NexoBIM_Z:Real", "NexoBIM_U:Real", "NexoBIM_Norma:Text", "NexoBIM_Fecha_Verificacion:Text", "NexoBIM_Aprobado_Por:Text");

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
