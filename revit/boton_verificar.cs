// NexoBIM · Botón de cinta "NexoBIM: verificar" (ToolBaker). Pide al panel (localhost:5173) que verifique y pinte.
// No espera la respuesta: el panel necesita que Revit quede libre para pintar. data.seco = true → no hace nada.
using System;
using System.Net.Http;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
using Newtonsoft.Json.Linq;

public static class McpDynamicScript
{
    public static object Run(UIApplication app, JObject data)
    {
        if ((bool?)data?["seco"] == true) return "NEXOBIM_BOTON_VERIFICAR (seco)";
        Task.Run(() => new HttpClient().PostAsync("http://localhost:5173/api/verificar", new StringContent("{}")));
        return "NexoBIM: verificación enviada al panel (http://localhost:5173). Revit se pintará al terminar.";
    }
}
