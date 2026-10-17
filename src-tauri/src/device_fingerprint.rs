//! Datos de la computadora para la licencia: UUID de hardware, número de serie, id de Windows, MAC físicas,
//! nombre, modelo, procesador y sistema. Se leen con comandos del sistema (sin permisos de administrador),
//! con argumentos fijos y tiempo límite. El backend calcula los hashes; los identificadores de hardware nunca
//! se muestran en claro en el panel.
use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct DeviceInfo {
  pub uuid: String,
  pub serial: String,
  pub machine_guid: String,
  pub macs: Vec<String>,
  pub hostname: String,
  pub model: String,
  pub cpu: String,
  pub os: String,
  pub os_version: String,
  pub platform: String,
}

/// Ejecuta un comando con tiempo límite y devuelve su salida (vacía si falla).
fn run(program: &str, args: &[&str]) -> String {
  let mut cmd = Command::new(program);
  cmd.args(args).stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null());
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // sin ventana de consola
  }
  let Ok(mut child) = cmd.spawn() else { return String::new() };
  let deadline = Instant::now() + Duration::from_secs(8);
  loop {
    match child.try_wait() {
      Ok(Some(_)) => break,
      Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(40)),
      _ => {
        let _ = child.kill();
        let _ = child.wait();
        return String::new();
      }
    }
  }
  let mut out = String::new();
  if let Some(mut s) = child.stdout.take() {
    let _ = s.take(256 * 1024).read_to_string(&mut out);
  }
  out
}

/// Valor de `"clave" = "valor"` (o `= <"valor">`) en la salida de ioreg.
#[cfg(target_os = "macos")]
fn ioreg_value(text: &str, key: &str) -> String {
  let needle = format!("\"{key}\" = ");
  for line in text.lines() {
    if let Some(pos) = line.find(&needle) {
      let rest = line[pos + needle.len()..].trim().trim_start_matches('<').trim_end_matches('>');
      return rest.trim_matches('"').trim().to_string();
    }
  }
  String::new()
}

#[cfg(target_os = "macos")]
pub fn collect() -> DeviceInfo {
  let io = run("/usr/sbin/ioreg", &["-rd1", "-c", "IOPlatformExpertDevice"]);
  let mut macs = Vec::new();
  let ports = run("/usr/sbin/networksetup", &["-listallhardwareports"]);
  let mut port = String::new();
  for line in ports.lines() {
    if let Some(p) = line.strip_prefix("Hardware Port: ") {
      port = p.to_lowercase();
    } else if let Some(m) = line.strip_prefix("Ethernet Address: ") {
      // Interfaces virtuales o de puente no cuentan
      let virtual_port = ["bridge", "bluetooth", "vpn", "thunderbolt bridge"].iter().any(|v| port.contains(v));
      if !virtual_port && m.trim() != "N/A" {
        macs.push(m.trim().to_string());
      }
    }
  }
  DeviceInfo {
    uuid: ioreg_value(&io, "IOPlatformUUID"),
    serial: ioreg_value(&io, "IOPlatformSerialNumber"),
    machine_guid: String::new(),
    macs,
    hostname: run("/usr/sbin/scutil", &["--get", "ComputerName"]).trim().to_string(),
    model: ioreg_value(&io, "model"),
    cpu: run("/usr/sbin/sysctl", &["-n", "machdep.cpu.brand_string"]).trim().to_string(),
    os: "macOS".into(),
    os_version: run("/usr/bin/sw_vers", &["-productVersion"]).trim().to_string(),
    platform: "macos".into(),
  }
}

#[cfg(windows)]
pub fn collect() -> DeviceInfo {
  // Un solo PowerShell con script fijo que devuelve líneas «clave=valor»
  const SCRIPT: &str = r#"
$ErrorActionPreference='SilentlyContinue'
$p=Get-CimInstance Win32_ComputerSystemProduct
$b=Get-CimInstance Win32_BIOS
$c=Get-CimInstance Win32_ComputerSystem
$cpu=Get-CimInstance Win32_Processor | Select-Object -First 1
$os=Get-CimInstance Win32_OperatingSystem
$g=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Cryptography' -Name MachineGuid).MachineGuid
"uuid=$($p.UUID)"
"serial=$($b.SerialNumber)"
"guid=$g"
"model=$($c.Manufacturer) $($c.Model)"
"cpu=$($cpu.Name)"
"os=$($os.Caption)"
"osVersion=$($os.Version)"
"host=$env:COMPUTERNAME"
Get-NetAdapter -Physical | ForEach-Object { $m = if ($_.PermanentAddress) { $_.PermanentAddress } else { $_.MacAddress }; "mac=$m" }
"#;
  let out = run("powershell.exe", &["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT]);
  let mut d = DeviceInfo { platform: "windows".into(), ..Default::default() };
  for line in out.lines() {
    let Some((k, v)) = line.split_once('=') else { continue };
    let v = v.trim().to_string();
    match k.trim() {
      "uuid" => d.uuid = v,
      "serial" => d.serial = v,
      "guid" => d.machine_guid = v,
      "model" => d.model = v,
      "cpu" => d.cpu = v,
      "os" => d.os = v,
      "osVersion" => d.os_version = v,
      "host" => d.hostname = v,
      "mac" if !v.is_empty() => d.macs.push(v),
      _ => {}
    }
  }
  d
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn collect() -> DeviceInfo {
  DeviceInfo { platform: "other".into(), ..Default::default() }
}

fn esc(s: &str) -> String {
  let mut out = String::with_capacity(s.len());
  for ch in s.chars() {
    match ch {
      '"' => out.push_str("\\\""),
      '\\' => out.push_str("\\\\"),
      c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
      c => out.push(c),
    }
  }
  out
}

impl DeviceInfo {
  /// JSON para el backend (variable de entorno DESKTOP_DEVICE_INFO).
  pub fn to_json(&self) -> String {
    let macs: Vec<String> = self.macs.iter().map(|m| format!("\"{}\"", esc(m))).collect();
    format!(
      "{{\"uuid\":\"{}\",\"serial\":\"{}\",\"machineGuid\":\"{}\",\"macs\":[{}],\"hostname\":\"{}\",\"model\":\"{}\",\"cpu\":\"{}\",\"os\":\"{}\",\"osVersion\":\"{}\",\"platform\":\"{}\"}}",
      esc(&self.uuid), esc(&self.serial), esc(&self.machine_guid), macs.join(","), esc(&self.hostname),
      esc(&self.model), esc(&self.cpu), esc(&self.os), esc(&self.os_version), esc(&self.platform)
    )
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn json_escapa_comillas_y_saltos() {
    let d = DeviceInfo { hostname: "Caja \"1\"\n".into(), macs: vec!["aa:bb".into()], ..Default::default() };
    let j = d.to_json();
    assert!(j.contains("\"hostname\":\"Caja \\\"1\\\"\\u000a\""));
    assert!(j.contains("\"macs\":[\"aa:bb\"]"));
  }
  #[cfg(target_os = "macos")]
  #[test]
  fn lee_esta_mac() {
    let d = collect();
    assert!(!d.uuid.is_empty(), "IOPlatformUUID");
    assert!(!d.serial.is_empty(), "número de serie");
  }
}
