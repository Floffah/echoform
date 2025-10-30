using Godot;
using System;
using System.Diagnostics;
using System.Linq;

public partial class EchoformLogger : Node {
    public static EchoformLogger Default;

    public LogLevel Level = LogLevel.INFO;

    public EchoformLogger() {
        if (Default == null) {
            Default = this;
        }

        if (OS.IsDebugBuild() || Engine.IsEditorHint()) {
            Level = LogLevel.DEBUG;
        }
    }

    public void Debug(params object[] what) {
        if (Level <= LogLevel.DEBUG) {
            GD.PrintRich("[color=light blue]", Format(LogLevel.DEBUG, what) + "[/color]");
        }
    }

    public void Info(params object[] what) {
        if (Level <= LogLevel.INFO) {
            GD.Print(Format(LogLevel.INFO, what));
        }
    }

    public void Warn(params object[] what) {
        if (Level <= LogLevel.WARN) {
            GD.PrintRich("[color=yellow]", Format(LogLevel.WARN, what), "[/color]");
        }
    }

    public void Error(params object[] what) {
        if (Level <= LogLevel.ERROR) {
            GD.PrintErr(Format(LogLevel.ERROR, what));
        }
    }

    private string Format(LogLevel level, params object[] what) {
        string template = DateTime.Now.ToString("HH:mm:ss") + $" | {level} @ Echoform ";

        var stackTrace = new StackTrace();
        var frame = stackTrace.GetFrame(1); // Get the caller frame

        if (frame != null) {
            var fileName = frame.GetMethod()?.DeclaringType?.FullName;
            var fileLine = frame.GetFileLineNumber();

            if (fileName != null) {
                template += "> " + fileName + " ";

                if (fileLine > 0) {
                    template += ":" + fileLine + " ";
                }
            }
        }

        template += "| ";

        return template + string.Join(" ", what.Select(o => o?.ToString() ?? "null"));
    }
}