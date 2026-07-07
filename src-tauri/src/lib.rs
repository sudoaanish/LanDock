use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let server_already_running = std::net::TcpStream::connect("127.0.0.1:3731").is_ok();

      if server_already_running {
        println!("[Tauri] Background Node.js server is already active on port 3731. Skipping spawn.");
        app.manage(Mutex::new(None::<Child>));
      } else {
        println!("[Tauri] Starting background Node.js server...");
        
        let resource_dir = app.path().resource_dir().expect("failed to get resource dir");
        let server_dir = resource_dir.join("_up_");
        let index_js_path = server_dir.join("index.js");

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new("node");
        #[cfg(target_os = "windows")]
        cmd.arg(index_js_path)
           .current_dir(&server_dir)
           .creation_flags(0x08000000); // CREATE_NO_WINDOW

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new("node");
        #[cfg(not(target_os = "windows"))]
        cmd.arg(index_js_path)
           .current_dir(&server_dir);

        let child = cmd.spawn();

        match child {
          Ok(c) => {
            println!("[Tauri] Background Node.js server started with PID: {}", c.id());
            app.manage(Mutex::new(Some(c)));
          }
          Err(e) => {
            eprintln!("[Tauri] Failed to start background Node.js server: {}", e);
            app.manage(Mutex::new(None::<Child>));
          }
        }
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|app_handle, event| {
    if let tauri::RunEvent::Exit = event {
      // Clean up the Node server when Tauri app exits
      let state = app_handle.state::<Mutex<Option<Child>>>();
      if let Ok(mut lock) = state.inner().lock() {
        if let Some(mut child) = lock.take() {
          match child.kill() {
            Ok(_) => println!("[Tauri] Cleanly terminated background Node.js server."),
            Err(e) => eprintln!("[Tauri] Failed to terminate background Node.js server: {}", e),
          }
        }
      }
    }
  });
}
