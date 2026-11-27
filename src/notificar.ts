// Notificación nativa de Windows (toast) sin dependencias: PowerShell 5.1 + Windows.UI.Notifications.
// Al hacer clic abre `url` (activationType="protocol"). Falla en silencio si no se puede.
import { execFile } from 'node:child_process';

const AUMID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';
const xml = (s: string) => s.replace(/[<>&"']/g, c => `&#${c.charCodeAt(0)};`);

export function toastXml(titulo: string, mensaje: string, url: string) {
  return `<toast activationType="protocol" launch="${xml(url)}"><visual><binding template="ToastGeneric"><text>${xml(titulo)}</text><text>${xml(mensaje)}</text></binding></visual></toast>`;
}

export function notificar(titulo: string, mensaje: string, url: string) {
  if (process.platform !== 'win32') return;
  const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$x = New-Object Windows.Data.Xml.Dom.XmlDocument
$x.LoadXml('${toastXml(titulo, mensaje, url)}')
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${AUMID}').Show((New-Object Windows.UI.Notifications.ToastNotification $x))`;
  try {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')],
      { windowsHide: true, timeout: 20_000 }, () => {}).on('error', () => {});
  } catch { /* sin PowerShell: silencio */ }
}
