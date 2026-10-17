//! Mi Tiendita de escritorio: arranca el servidor local (Node + Express + SQLite) y abre la ventana sobre él.
//!
//! - Los datos viven en la carpeta de datos de la app del usuario (`app_local_data_dir`): `data/mitiendita.db`,
//!   `secret.key` y `logs/servidor.log`. Nunca dentro del instalador.
//! - El servidor escucha solo en 127.0.0.1:17841. Si se cierra la app, se apaga con ella.
//! - Solo puede haber una copia abierta: la segunda trae al frente la que ya está.
use std::fs;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

mod device_fingerprint;

const PORT: u16 = 17841;

struct Backend(Mutex<Option<Child>>);

/// Clave aleatoria guardada una vez en la carpeta de datos (firma las sesiones de esta computadora).
fn secret(dir: &Path, name: &str) -> std::io::Result<String> {
  let file = dir.join(name);
  if let Ok(s) = fs::read_to_string(&file) {
    let s = s.trim().to_string();
    if s.len() >= 64 {
      return Ok(s);
    }
  }
  let mut bytes = [0u8; 32];
  getrandom::getrandom(&mut bytes).map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
  let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
  fs::write(&file, &hex)?;
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let _ = fs::set_permissions(&file, fs::Permissions::from_mode(0o600));
  }
  Ok(hex)
}

/// Node empaquetado junto al ejecutable (Tauri lo coloca ahí desde `externalBin`).
fn node_binary() -> PathBuf {
  let exe = std::env::current_exe().expect("ruta del ejecutable");
  let dir = exe.parent().expect("carpeta del ejecutable");
  if cfg!(windows) { dir.join("node.exe") } else { dir.join("node") }
}

fn port_open() -> bool {
  TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], PORT)), Duration::from_millis(300)).is_ok()
}

/// ¿El servidor ya responde /health? (petición HTTP mínima, sin dependencias)
fn healthy() -> bool {
  let Ok(mut s) = TcpStream::connect_timeout(&SocketAddr::from(([127, 0, 0, 1], PORT)), Duration::from_millis(500)) else {
    return false;
  };
  let _ = s.set_read_timeout(Some(Duration::from_millis(1500)));
  if s.write_all(b"GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n").is_err() {
    return false;
  }
  let mut buf = String::new();
  let _ = s.read_to_string(&mut buf);
  buf.starts_with("HTTP/1.1 200")
}

fn start_backend(app: &tauri::AppHandle) -> Result<Child, String> {
  let data = app.path().app_local_data_dir().map_err(|e| e.to_string())?;
  let logs = data.join("logs");
  fs::create_dir_all(data.join("data")).map_err(|e| e.to_string())?;
  fs::create_dir_all(&logs).map_err(|e| e.to_string())?;
  let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
  let backend = resources.join("backend");
  let ui = resources.join("ui");
  let log = fs::OpenOptions::new().create(true).append(true).open(logs.join("servidor.log")).map_err(|e| e.to_string())?;
  let err = log.try_clone().map_err(|e| e.to_string())?;

  let mut cmd = Command::new(node_binary());
  cmd.arg(backend.join("app.js"))
    .current_dir(&backend)
    .env("PORT", PORT.to_string())
    .env("HOST", "127.0.0.1")
    .env("DESKTOP", "1")
    .env("NODE_ENV", "production")
    .env("SECRET_KEY", secret(&data, "secret.key").map_err(|e| e.to_string())?)
    .env("MFA_ENCRYPTION_KEY", secret(&data, "mfa.key").map_err(|e| e.to_string())?)
    .env("SQLITE_PATH", data.join("data").join("mitiendita.db"))
    .env("FRONTEND_DIST", &ui)
    .env("APP_DATA_DIR", &data)
    .env("DESKTOP_DEVICE_INFO", device_fingerprint::collect().to_json())
    .env("APP_VERSION", app.package_info().version.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::from(log))
    .stderr(Stdio::from(err));
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW: sin consola negra
  }
  cmd.spawn().map_err(|e| format!("No se pudo iniciar el servidor local: {e}"))
}

fn open_main_window(app: &tauri::AppHandle) {
  let url = format!("http://127.0.0.1:{PORT}/").parse().expect("url local");
  let _ = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
    .title("Mi Tiendita")
    .inner_size(1280.0, 800.0)
    .min_inner_size(900.0, 600.0)
    .build();
}

fn show_error(app: &tauri::AppHandle, msg: &str) {
  let html = format!(
    "<!doctype html><meta charset=utf-8><body style=\"font-family:system-ui;padding:2rem;background:#F4F1EA\"><h2>No se pudo abrir Mi Tiendita</h2><p>{}</p><p>Cierra la app y vuelve a abrirla. Si sigue pasando, comunícate con soporte.</p></body>",
    msg.replace('<', "&lt;")
  );
  let url = format!("data:text/html;charset=utf-8,{}", urlencode(&html));
  if let Ok(u) = url.parse() {
    let _ = WebviewWindowBuilder::new(app, "error", WebviewUrl::External(u)).title("Mi Tiendita").inner_size(640.0, 360.0).build();
  }
}

fn urlencode(s: &str) -> String {
  s.bytes().map(|b| match b {
    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
    _ => format!("%{b:02X}"),
  }).collect()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
      }
    }))
    .manage(Backend(Mutex::new(None)))
    .setup(|app| {
      let handle = app.handle().clone();
      // Ventana de espera mientras arranca el servidor
      let _ = WebviewWindowBuilder::new(&handle, "splash", WebviewUrl::App("index.html".into()))
        .title("Mi Tiendita")
        .inner_size(420.0, 260.0)
        .resizable(false)
        .decorations(true)
        .build();
      std::thread::spawn(move || {
        if port_open() && !healthy() {
          if let Some(s) = handle.get_webview_window("splash") { let _ = s.close(); }
          show_error(&handle, &format!("El puerto {PORT} de esta computadora está ocupado por otro programa."));
          return;
        }
        if !healthy() {
          match start_backend(&handle) {
            Ok(child) => *handle.state::<Backend>().0.lock().unwrap() = Some(child),
            Err(e) => {
              if let Some(s) = handle.get_webview_window("splash") { let _ = s.close(); }
              show_error(&handle, &e);
              return;
            }
          }
        }
        let started = Instant::now();
        while !healthy() {
          if started.elapsed() > Duration::from_secs(40) {
            if let Some(s) = handle.get_webview_window("splash") { let _ = s.close(); }
            show_error(&handle, "El servidor local no respondió a tiempo. Revisa logs/servidor.log en la carpeta de datos de la app.");
            return;
          }
          std::thread::sleep(Duration::from_millis(250));
        }
        let h = handle.clone();
        let _ = handle.run_on_main_thread(move || {
          open_main_window(&h);
          if let Some(s) = h.get_webview_window("splash") { let _ = s.close(); }
        });
      });
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("no se pudo construir la app");

  app.run(|handle, event| {
    if let RunEvent::Exit = event {
      if let Some(mut child) = handle.state::<Backend>().0.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
      }
    }
  });
}
