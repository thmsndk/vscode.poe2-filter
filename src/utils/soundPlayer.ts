import { spawn } from "child_process";
import * as path from "path";
import { execSync } from "child_process";

export class SoundPlayer {
  private static readonly players = [
    "mpg123", // Cross-platform, no GUI
    "mplayer", // Cross-platform
    "afplay", // macOS
    "paplay", // Linux Pulse Audio
    "aplay", // Linux ALSA
    "mpg321", // Cross-platform
    "play", // Sox
    "cvlc", // VLC
    "powershell", // Windows last resort
  ];

  private static selectedPlayer: string | null = null;

  private static initialize() {
    if (this.selectedPlayer !== null) {
      return;
    }

    const cmd = process.platform === "win32" ? "where" : "which";

    console.log("🔊 Initializing sound player...");
    console.log("Platform:", process.platform);

    // Try to find an installed player
    for (const player of this.players) {
      try {
        execSync(`${cmd} ${player}`, { stdio: "ignore" });
        this.selectedPlayer = player;
        console.log("Found player:", player);
        return;
      } catch {
        console.log("Player not found:", player);
        continue;
      }
    }
  }

  private static getPlayerCommand(
    player: string,
    soundPath: string
  ): {
    cmd: string;
    args: string[];
    options: { stdio: "ignore" | "pipe"; windowsHide?: boolean };
  } {
    console.log("Getting command for player:", player);
    console.log("Sound path:", soundPath);

    const baseOptions = { stdio: "pipe" as const };

    switch (player) {
      case "powershell":
        const script = `
          param([string]$audioPath)
          
          function Get-SongDuration([string]$Path) {
            try {
              $shell = New-Object -ComObject Shell.Application
              $folder = Split-Path $Path
              $file = Split-Path $Path -Leaf
              $shellfolder = $shell.Namespace($folder)
              $shellfile = $shellfolder.ParseName($file)
              $duration = $shellfolder.GetDetailsOf($shellfile, 27)
              [Runtime.InteropServices.Marshal]::ReleaseComObject($shell) | Out-Null
              
              if ([string]::IsNullOrEmpty($duration)) {
                Write-Output "No duration found, using default"
                return "00:00:02"
              }
              return $duration
            }
            catch {
              Write-Output "Error getting duration: $_"
              return "00:00:02"
            }
          }

          try {
            Write-Output "Getting duration..."
            $duration = Get-SongDuration $audioPath
            Write-Output "Duration found: $duration"
            $durationSeconds = ([timespan]$duration).TotalSeconds
            Write-Output "Duration in seconds: $durationSeconds"

            Write-Output "Loading PresentationCore..."
            Add-Type -AssemblyName PresentationCore
            
            Write-Output "Creating MediaPlayer..."
            $mediaPlayer = New-Object system.windows.media.mediaplayer
            
            Write-Output "Opening file: $audioPath"
            $mediaPlayer.open($audioPath)
            
            Write-Output "Starting playback..."
            $mediaPlayer.Play()
            
            Write-Output "Waiting for $durationSeconds seconds..."
            Start-Sleep -Seconds $durationSeconds
            
            Write-Output "Cleanup..."
            $mediaPlayer.Stop()
            $mediaPlayer.Close()
          }
          catch {
            Write-Error "Error: $_"
            exit 1
          }
        `;
        return {
          cmd: "powershell",
          args: [
            "-NoProfile",
            "-NonInteractive",
            "-NoLogo",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `& { ${script} } -audioPath "${soundPath}"`,
          ],
          options: { ...baseOptions, windowsHide: true },
        };
      case "afplay":
        return { cmd: "afplay", args: [soundPath], options: baseOptions };
      case "paplay":
      case "aplay":
        return { cmd: player, args: [soundPath], options: baseOptions };
      case "mplayer":
        return {
          cmd: "mplayer",
          args: ["-really-quiet", "-nolirc", soundPath],
          options: baseOptions,
        };
      case "mpg123":
      case "mpg321":
        return { cmd: player, args: ["-q", soundPath], options: baseOptions };
      case "play":
        return { cmd: "play", args: ["-q", soundPath], options: baseOptions };
      case "cvlc":
        return {
          cmd: "cvlc",
          args: ["--play-and-exit", "--quiet", soundPath],
          options: baseOptions,
        };
      default:
        throw new Error(`Unsupported player: ${player}`);
    }
  }

  static play(soundPath: string): void {
    if (this.selectedPlayer === null) {
      this.initialize();
    }

    if (!this.selectedPlayer) {
      console.error("❌ No suitable audio player found");
      return;
    }

    try {
      console.log("Playing sound with:", this.selectedPlayer);
      const { cmd, args, options } = this.getPlayerCommand(
        this.selectedPlayer,
        soundPath
      );

      const childProcess = spawn(cmd, args, options);

      childProcess.stdout?.on("data", (data) => {
        console.log(`stdout: ${data}`);
      });

      childProcess.stderr?.on("data", (data) => {
        console.error(`stderr: ${data}`);
      });

      childProcess.on("error", (err) => {
        console.error("❌ Failed to start sound process:", err);
      });

      childProcess.on("exit", (code) => {
        console.log(`Sound process exited with code: ${code}`);
      });
    } catch (err) {
      console.error("❌ Error playing sound:", err);
    }
  }
}
