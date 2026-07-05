$RunSettings = @{
    DependencyPaths = @(
        "node_modules",
        "server/node_modules/tsx/dist/cli.mjs",
        "web/node_modules/vite/bin/vite.js"
    )
    Server          = @{
        Name            = "server"
        Host            = "127.0.0.1"
        Port            = 8787
        MatchToken      = "--filter @debate-koshien/server start"
        StartArgs       = @("--filter", "@debate-koshien/server", "start")
        DirectPnpm      = $true
        PortSearchLimit = 0
    }
    Web             = @{
        Name            = "web"
        Host            = "localhost"
        Port            = 56173
        MatchToken      = "dev:web"
        StartArgs       = @("dev:web")
        DirectPnpm      = $false
        PortSearchLimit = 100
    }
    Tts             = @{
        Root      = "assets/tts"
        PiperDir  = "piper"
        ModelsDir = "models"
        TempDir   = "_tmp"
        Windows   = @{
            ArchiveName = "piper-windows-x64.zip"
            ArchiveUrl  = "https://github.com/ayutaz/piper-plus/releases/latest/download/piper-windows-x64.zip"
            BinaryName  = "piper.exe"
        }
        Linux     = @{
            ArchiveName = "piper-linux-x64.tar.gz"
            ArchiveUrl  = "https://github.com/ayutaz/piper-plus/releases/latest/download/piper-linux-x64.tar.gz"
            BinaryPath  = "bin/piper"
        }
        Japanese  = @{
            Language   = "ja"
            ModelFile  = "tsukuyomi.onnx"
            ConfigFile = "config.json"
            ModelUrl   = "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/tsukuyomi-chan-6lang-fp16.onnx"
            ConfigUrl  = "https://huggingface.co/ayousanz/piper-plus-tsukuyomi-chan/resolve/main/config.json"
            SampleFile = "sample-ja.wav"
            SampleText = ( -join ([char[]](0x97F3, 0x58F0, 0x5408, 0x6210, 0x306E, 0x30C6, 0x30B9, 0x30C8, 0x3067, 0x3059, 0x3002)))
            Label      = "Japanese"
        }
        English   = @{
            Language   = "en"
            ModelFile  = "en_US-lessac-medium.onnx"
            ConfigFile = "en_US-lessac-medium.onnx.json"
            BaseUrl    = "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium"
            SampleFile = "sample-en.wav"
            SampleText = "This is a synthesis test."
            Label      = "English"
        }
    }
}