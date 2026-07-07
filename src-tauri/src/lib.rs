use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::SystemTime;
use tauri::Manager;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

enum NodeRuntime {
    Bundled(PathBuf),
    System(PathBuf),
}

impl NodeRuntime {
    fn path(&self) -> &Path {
        match self {
            NodeRuntime::Bundled(path) | NodeRuntime::System(path) => path,
        }
    }

    fn source(&self) -> &'static str {
        match self {
            NodeRuntime::Bundled(_) => "bundled",
            NodeRuntime::System(_) => "system",
        }
    }
}

fn append_backend_log(log_path: &Path, message: &str) {
    if let Some(parent) = log_path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "[{:?}] {}", SystemTime::now(), message);
    }
}

fn path_for_child_process(path: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let path_string = path.display().to_string();
        if let Some(stripped) = path_string.strip_prefix("\\\\?\\") {
            return PathBuf::from(stripped);
        }
    }

    path.to_path_buf()
}

fn find_system_node_executable() -> Option<PathBuf> {
    let executable_name = if cfg!(target_os = "windows") {
        "node.exe"
    } else {
        "node"
    };

    if let Some(path_var) = env::var_os("PATH") {
        for path in env::split_paths(&path_var) {
            let candidate = path.join(executable_name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        let common_paths = [
            r"C:\Program Files\nodejs\node.exe",
            r"C:\Program Files (x86)\nodejs\node.exe",
        ];

        for path in common_paths {
            let candidate = PathBuf::from(path);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

fn resolve_node_runtime(server_dir: &Path, log_path: &Path) -> Option<NodeRuntime> {
    let bundled_node = if cfg!(target_os = "windows") {
        server_dir
            .join("vendor")
            .join("node")
            .join("win-x64")
            .join("node.exe")
    } else {
        server_dir.join("vendor").join("node").join("node")
    };

    append_backend_log(
        log_path,
        &format!("Resolved bundled Node path: {}", bundled_node.display()),
    );
    append_backend_log(
        log_path,
        &format!("bundled Node exists: {}", bundled_node.is_file()),
    );

    if bundled_node.is_file() {
        return Some(NodeRuntime::Bundled(bundled_node));
    }

    append_backend_log(log_path, "Bundled Node runtime was not found.");

    if cfg!(debug_assertions) {
        append_backend_log(
            log_path,
            "Debug build: checking PATH and common install locations for system Node fallback.",
        );

        if let Some(system_node) = find_system_node_executable() {
            append_backend_log(
                log_path,
                &format!("Resolved system Node fallback: {}", system_node.display()),
            );
            return Some(NodeRuntime::System(system_node));
        }

        append_backend_log(
            log_path,
            "System Node fallback was not found in PATH or common Windows install paths.",
        );
    } else {
        append_backend_log(
            log_path,
            "Release build: refusing to use system Node fallback. The packaged app requires bundled Node.",
        );
    }

    None
}

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

      let log_dir = app
        .path()
        .app_local_data_dir()
        .unwrap_or_else(|_| env::temp_dir().join("LanDock"))
        .join("logs");
      let backend_log_path = log_dir.join("backend.log");

      append_backend_log(&backend_log_path, "LanDock backend startup check beginning.");
      append_backend_log(
        &backend_log_path,
        &format!("Backend log path: {}", backend_log_path.display()),
      );

      let server_already_running = std::net::TcpStream::connect("127.0.0.1:3731").is_ok();
      append_backend_log(
        &backend_log_path,
        &format!("Port 3731 already accepting connections: {}", server_already_running),
      );

      if server_already_running {
        println!("[Tauri] Background Node.js server is already active on port 3731. Skipping spawn.");
        append_backend_log(&backend_log_path, "Port 3731 is already active. Skipping backend spawn.");
        app.manage(Mutex::new(None::<Child>));
      } else {
        println!("[Tauri] Starting background Node.js server...");

        let resource_dir = app.path().resource_dir().expect("failed to get resource dir");
        let server_dir = resource_dir.join("_up_");
        let index_js_path = server_dir.join("index.js");

        append_backend_log(
          &backend_log_path,
          &format!("Resolved resource_dir: {}", resource_dir.display()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("Resolved server_dir: {}", server_dir.display()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("Resolved index.js path: {}", index_js_path.display()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("resource_dir exists: {}", resource_dir.exists()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("server_dir exists: {}", server_dir.exists()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("index.js exists: {}", index_js_path.exists()),
        );

        let Some(node_runtime) = resolve_node_runtime(&server_dir, &backend_log_path) else {
          append_backend_log(
            &backend_log_path,
            "Failed to resolve a usable Node runtime. Backend was not started.",
          );
          eprintln!("[Tauri] Failed to resolve a usable Node runtime. Backend was not started.");
          app.manage(Mutex::new(None::<Child>));
          return Ok(());
        };
        let node_path = node_runtime.path();

        append_backend_log(
          &backend_log_path,
          &format!("Selected Node runtime source: {}", node_runtime.source()),
        );
        append_backend_log(
          &backend_log_path,
          &format!("Selected Node executable: {}", node_path.display()),
        );
        let child_node_path = path_for_child_process(node_path);
        let child_index_js_path = path_for_child_process(&index_js_path);
        let child_server_dir = path_for_child_process(&server_dir);
        append_backend_log(
          &backend_log_path,
          &format!(
            "Child process paths: node=\"{}\", index=\"{}\", current_dir=\"{}\"",
            child_node_path.display(),
            child_index_js_path.display(),
            child_server_dir.display()
          ),
        );
        append_backend_log(
          &backend_log_path,
          &format!(
            "Attempting backend launch: \"{}\" \"{}\" with current_dir \"{}\"",
            child_node_path.display(),
            child_index_js_path.display(),
            child_server_dir.display()
          ),
        );

        let stdout_log = OpenOptions::new()
          .create(true)
          .append(true)
          .open(&backend_log_path);
        let stderr_log = OpenOptions::new()
          .create(true)
          .append(true)
          .open(&backend_log_path);

        #[cfg(target_os = "windows")]
        let mut cmd = Command::new(&child_node_path);
        #[cfg(target_os = "windows")]
        cmd.arg(&child_index_js_path)
           .current_dir(&child_server_dir)
           .creation_flags(0x08000000); // CREATE_NO_WINDOW

        #[cfg(not(target_os = "windows"))]
        let mut cmd = Command::new(&child_node_path);
        #[cfg(not(target_os = "windows"))]
        cmd.arg(&child_index_js_path)
           .current_dir(&child_server_dir);

        if let Ok(file) = stdout_log {
          cmd.stdout(Stdio::from(file));
        } else {
          append_backend_log(&backend_log_path, "Failed to open backend log for stdout redirection.");
        }

        if let Ok(file) = stderr_log {
          cmd.stderr(Stdio::from(file));
        } else {
          append_backend_log(&backend_log_path, "Failed to open backend log for stderr redirection.");
        }

        let child = cmd.spawn();

        match child {
          Ok(c) => {
            println!("[Tauri] Background Node.js server started with PID: {}", c.id());
            append_backend_log(
              &backend_log_path,
              &format!("Backend spawn succeeded. PID: {}", c.id()),
            );
            app.manage(Mutex::new(Some(c)));
          }
          Err(e) => {
            eprintln!("[Tauri] Failed to start background Node.js server: {}", e);
            append_backend_log(
              &backend_log_path,
              &format!("Backend spawn failed: {}", e),
            );
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
                        Err(e) => eprintln!(
                            "[Tauri] Failed to terminate background Node.js server: {}",
                            e
                        ),
                    }
                }
            }
        }
    });
}
