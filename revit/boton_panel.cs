// NexoBIM · Botón de cinta "Abrir panel" (ToolBaker): abre http://localhost:5173 en el navegador. data.seco = true → no hace nada.
using System.Diagnostics;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    public static object Run(UIApplication app, JObject data)
    {
        if ((bool?)data?["seco"] == true) return "NEXOBIM_BOTON_PANEL (seco)";
        Process.Start(new ProcessStartInfo("http://localhost:5173") { UseShellExecute = true });
        return "NexoBIM: panel abierto en el navegador.";
    }
}
